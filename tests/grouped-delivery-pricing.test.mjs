import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGroupedDeliveryPrice,
  GROUPED_DELIVERY_PRICING,
  optimizeDeliveryTourRoute,
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
 assert.equal(route.totalRoadDistanceKm,6);
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
