import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGroupedDeliveryPrice,
  GROUPED_DELIVERY_PRICING,
  optimizeDeliveryTourRoute,
  buildDeliveryTourRouteWithOsrm,
  buildGroupedDeliveryPlanWithOsrm,
  applyDeliveryTourStopTransition
} from "../cloudflare/worker.js";

test("grouped tour price follows the validated distance and shop formula",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:8,shopCount:3});
  assert.equal(result.rawPriceXof,2100);
  assert.equal(result.totalPriceXof,2100);
  assert.equal(result.currency,"XOF");
});

test("grouped tour price rounds to the nearest 100 XOF",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:1.2,shopCount:2});
  assert.equal(result.rawPriceXof,880);
  assert.equal(result.roundedPriceXof,900);
  assert.equal(result.totalPriceXof,1000);
});

test("grouped tour minimum price is enforced after rounding",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:1,shopCount:2});
  assert.equal(result.roundedPriceXof,900);
  assert.equal(result.totalPriceXof,GROUPED_DELIVERY_PRICING.minimumTourPriceXof);
});

test("grouped tour accepts the configured upper shop and distance limits",()=>{
  const result=calculateGroupedDeliveryPrice({roadDistanceKm:250,shopCount:25});
  assert.equal(result.shopCount,25);
  assert.ok(result.totalPriceXof>0);
});

test("grouped tour rejects invalid distance and shop counts",()=>{
  for(const roadDistanceKm of [0,-1,NaN,Infinity,251,"8",null]){
    assert.throws(()=>calculateGroupedDeliveryPrice({roadDistanceKm,shopCount:2}),/invalid_grouped_delivery_distance/);
  }
  for(const shopCount of [0,1,1.5,26,"3",null]){
    assert.throws(()=>calculateGroupedDeliveryPrice({roadDistanceKm:8,shopCount}),/invalid_grouped_delivery_shop_count/);
  }
});

const routeStops=[
 {id:"courier",type:"origin"},
 {id:"shop-a",type:"shop",latitude:5.35,longitude:-4.02},
 {id:"shop-b",type:"shop",latitude:5.36,longitude:-4.01},
 {id:"shop-c",type:"shop",latitude:5.37,longitude:-4.00},
 {id:"customer",type:"destination"}
];
const routeMatrix=[
 [0,3,1,4,8],
 [3,0,2,3,6],
 [1,2,0,2,5],
 [4,3,2,0,1],
 [8,6,5,1,0]
];

test("multi-stop route planner uses supplied road distances and orders nearby pickups",()=>{
 const route=optimizeDeliveryTourRoute({stops:routeStops,distanceMatrix:routeMatrix});
 assert.deepEqual(route.orderedStopIds,["courier","shop-b","shop-a","shop-c","customer"]);
 assert.deepEqual(route.pickupStopIds,["shop-b","shop-a","shop-c"]);
 assert.equal(route.destinationStopId,"customer");
 assert.equal(route.totalRoadDistanceKm,7);
});

test("route planner rejects malformed stops, coordinates and road matrices",()=>{
 assert.throws(()=>optimizeDeliveryTourRoute({stops:routeStops.slice(0,2),distanceMatrix:[[0,1],[1,0]]}),/invalid_delivery_tour_stops/);
 assert.throws(()=>optimizeDeliveryTourRoute({stops:routeStops.map((x,i)=>i===1?{...x,latitude:100}:x),distanceMatrix:routeMatrix}),/invalid_delivery_tour_shop_coordinates/);
 assert.throws(()=>optimizeDeliveryTourRoute({stops:routeStops,distanceMatrix:[]}),/invalid_delivery_tour_distance_matrix/);
 const bad=routeMatrix.map(row=>row.slice());bad[0][1]=-1;
 assert.throws(()=>optimizeDeliveryTourRoute({stops:routeStops,distanceMatrix:bad}),/invalid_delivery_tour_road_distance/);
});

test("tour pickup progression requires stops to be completed in route order",()=>{
 const initial=routeStops.slice(1,-1).map(x=>({id:x.id,status:"pending"}));
 assert.throws(()=>applyDeliveryTourStopTransition({stops:initial,stopId:"shop-b",nextStatus:"arrived"}),/previous_stop_incomplete/);
 const arrived=applyDeliveryTourStopTransition({stops:initial,stopId:"shop-a",nextStatus:"arrived"});
 assert.equal(arrived.tourStatus,"assigned");
 const picked=applyDeliveryTourStopTransition({stops:arrived.stops,stopId:"shop-a",nextStatus:"picked_up"});
 assert.equal(picked.pickedUpCount,1);
 assert.equal(picked.tourStatus,"collecting");
 assert.throws(()=>applyDeliveryTourStopTransition({stops:picked.stops,stopId:"shop-a",nextStatus:"arrived"}),/invalid_delivery_tour_stop_transition/);
});

test("tour enters delivery phase only after every shop pickup is confirmed",()=>{
 let state={stops:[{id:"a",status:"pending"},{id:"b",status:"pending"}]};
 for(const id of ["a","b"]){
  state=applyDeliveryTourStopTransition({stops:state.stops,stopId:id,nextStatus:"arrived"});
  state=applyDeliveryTourStopTransition({stops:state.stops,stopId:id,nextStatus:"picked_up"});
 }
 assert.equal(state.allPickedUp,true);
 assert.equal(state.tourStatus,"delivering");
});


test("OSRM table response feeds road distances and durations into the delivery tour planner",async()=>{
 const osrmStops=routeStops.map((stop,index)=>({...stop,latitude:stop.latitude??(index===0?5.34:5.38),longitude:stop.longitude??(index===0?-4.03:-3.99)}));
 const distances=routeMatrix.map(row=>row.map(value=>value*1000));
 const durations=routeMatrix.map(row=>row.map(value=>value*120));
 let requestedUrl="";
 const result=await buildDeliveryTourRouteWithOsrm({
  stops:osrmStops,
  fetchImpl:async url=>{
   requestedUrl=url;
   return {ok:true,json:async()=>({code:"Ok",distances,durations})};
  }
 });
 const parsed=new URL(requestedUrl);
 assert.match(parsed.pathname,/^\/table\/v1\/driving\//);
 assert.equal(parsed.searchParams.get("annotations"),"distance,duration");
 assert.deepEqual(result.orderedStopIds,["courier","shop-b","shop-a","shop-c","customer"]);
 assert.equal(result.totalRoadDistanceKm,7);
 assert.equal(result.totalDurationSeconds,840);
 assert.equal(result.provider,"osrm");
 assert.match(decodeURIComponent(parsed.pathname),/-4\.03,5\.34/);
});

test("OSRM adapter rejects incomplete or invalid routing responses",async()=>{
 const osrmStops=routeStops.map((stop,index)=>({...stop,latitude:stop.latitude??(index===0?5.34:5.38),longitude:stop.longitude??(index===0?-4.03:-3.99)}));
 await assert.rejects(()=>buildDeliveryTourRouteWithOsrm({
  stops:osrmStops,fetchImpl:async()=>({ok:true,json:async()=>({code:"NoRoute"})})
 }),/invalid_osrm_matrix/);
 await assert.rejects(()=>buildDeliveryTourRouteWithOsrm({
  stops:osrmStops,baseUrl:"http://router.project-osrm.org",fetchImpl:async()=>({ok:true,json:async()=>({})})
 }),/invalid_osrm_base_url/);
 await assert.rejects(()=>buildDeliveryTourRouteWithOsrm({
  stops:osrmStops,fetchImpl:async()=>({ok:false,status:429})
 }),/osrm_http_429/);
});

test("grouped delivery planner orders all confirmed shop pickups before the shared destination",async()=>{
 const shops=[
  {id:"shop-a",latitude:5.35,longitude:-4.02},
  {id:"shop-b",latitude:5.36,longitude:-4.01},
  {id:"shop-c",latitude:5.37,longitude:-4.00}
 ];
 const destination={id:"destination",latitude:5.38,longitude:-3.99};
 const distances=[
  [0,4000,1000,7000],
  [4000,0,2000,6000],
  [1000,2000,0,5000],
  [7000,6000,5000,0]
 ];
 const durations=distances.map(row=>row.map(value=>value/8));
 const result=await buildGroupedDeliveryPlanWithOsrm({
  shops,destination,
  fetchImpl:async()=>({ok:true,json:async()=>({code:"Ok",distances,durations})})
 });
 assert.deepEqual(result.orderedShopIds,["shop-a","shop-c","shop-b"]);
 assert.equal(result.destinationStopId,"destination");
 assert.equal(result.totalRoadDistanceKm,9);
 assert.equal(result.totalDurationSeconds,1125);
 assert.equal(result.provider,"osrm");
 assert.match(result.distanceScope,/excludes_courier_approach/);
});

test("grouped delivery planner rejects invalid pickup count, coordinates and OSRM responses",async()=>{
 const shops=[{id:"a",latitude:5.35,longitude:-4.02},{id:"b",latitude:5.36,longitude:-4.01}];
 const destination={id:"destination",latitude:5.37,longitude:-4.00};
 await assert.rejects(()=>buildGroupedDeliveryPlanWithOsrm({
  shops:shops.slice(0,1),destination,fetchImpl:async()=>({ok:true,json:async()=>({})})
 }),/invalid_grouped_delivery_stops/);
 await assert.rejects(()=>buildGroupedDeliveryPlanWithOsrm({
  shops:shops.map((shop,index)=>index===0?{...shop,latitude:100}:shop),destination,
  fetchImpl:async()=>({ok:true,json:async()=>({})})
 }),/invalid_grouped_delivery_coordinates/);
 await assert.rejects(()=>buildGroupedDeliveryPlanWithOsrm({
  shops,destination,fetchImpl:async()=>({ok:true,json:async()=>({code:"NoRoute"})})
 }),/invalid_osrm_matrix/);
});
