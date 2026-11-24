/**
 * Mon Business — primitives CRM, ventes, commandes et crédit client.
 * Calculs purs : aucune persistance, facturation fiscale ni décision de crédit.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MonBusinessSales = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const clean = v => typeof v === "string" ? v.trim() : "";
  const ORDER_STATES = Object.freeze(["received","confirmed","preparing","ready","in_delivery","delivered","completed","cancelled"]);
  const PAYMENT_STATES = Object.freeze(["unpaid","partial","paid","refunded","partially_refunded"]);
  const ORDER_FLOW = {
    received:["confirmed","cancelled"],
    confirmed:["preparing","cancelled"],
    preparing:["ready","cancelled"],
    ready:["in_delivery","delivered","cancelled"],
    in_delivery:["delivered","cancelled"],
    delivered:["completed"],
    completed:[],
    cancelled:[]
  };

  function validateSale(sale = {}) {
    const errors = [];
    for (const key of ["businessId","activityId","reference","authorUid","source"]) {
      if (!clean(sale[key])) errors.push(key);
    }
    if (!Array.isArray(sale.lines) || sale.lines.length === 0) errors.push("lines");
    else sale.lines.forEach((line,i)=>{
      if (!clean(line.itemId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0
          || !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) errors.push("lines."+i);
    });
    if (sale.paymentStatus && !PAYMENT_STATES.includes(sale.paymentStatus)) errors.push("paymentStatus");
    if (sale.status === "cancelled" && sale.countsAsRevenue === true) errors.push("cancelledRevenue");
    return {valid:errors.length===0,errors};
  }

  function saleTotalMinor(sale) {
    const check=validateSale(sale);
    if(!check.valid) throw new TypeError("Vente invalide : "+check.errors.join(", "));
    const total=sale.lines.reduce((sum,line)=>sum+line.quantity*line.unitPriceMinor,0);
    if(!Number.isSafeInteger(total)) throw new RangeError("Total de vente trop élevé.");
    return total;
  }

  function canTransitionOrder(current,next) {
    return Boolean(ORDER_FLOW[current] && ORDER_FLOW[current].includes(next));
  }

  function validateCreditPolicy(policy = {}) {
    const errors=[];
    if(typeof policy.enabled!=="boolean") errors.push("enabled");
    if(policy.enabled){
      if(!Number.isSafeInteger(policy.maxOutstandingMinor)||policy.maxOutstandingMinor<=0) errors.push("maxOutstandingMinor");
      if(!Number.isSafeInteger(policy.termDays)||policy.termDays<1||policy.termDays>365) errors.push("termDays");
    }
    return {valid:errors.length===0,errors};
  }

  function creditExposure(openItems = []) {
    let exposure=0;
    for(const item of openItems){
      if(!Number.isSafeInteger(item.outstandingMinor)||item.outstandingMinor<0) throw new TypeError("Solde client invalide.");
      if(item.status!=="cancelled"&&item.status!=="refunded") exposure+=item.outstandingMinor;
      if(!Number.isSafeInteger(exposure)) throw new RangeError("Encours client trop élevé.");
    }
    return exposure;
  }

  function validateCreditSale({policy,openItems=[],amountMinor}={}) {
    const policyCheck=validateCreditPolicy(policy);
    if(!policyCheck.valid) return {allowed:false,reason:"invalid_policy",errors:policyCheck.errors};
    if(!policy.enabled) return {allowed:false,reason:"credit_disabled",errors:[]};
    if(!Number.isSafeInteger(amountMinor)||amountMinor<=0) return {allowed:false,reason:"invalid_amount",errors:[]};
    const current=creditExposure(openItems);
    if(amountMinor>policy.maxOutstandingMinor-current) return {allowed:false,reason:"credit_limit_exceeded",errors:[],currentExposureMinor:current};
    return {allowed:true,reason:null,errors:[],currentExposureMinor:current,projectedExposureMinor:current+amountMinor};
  }

  function applyPayment({outstandingMinor,paidMinor}={}) {
    if(!Number.isSafeInteger(outstandingMinor)||outstandingMinor<0||!Number.isSafeInteger(paidMinor)||paidMinor<=0||paidMinor>outstandingMinor){
      throw new TypeError("Paiement invalide.");
    }
    return {outstandingMinor:outstandingMinor-paidMinor,status:paidMinor===outstandingMinor?"paid":"partial"};
  }

  return Object.freeze({ORDER_STATES,PAYMENT_STATES,validateSale,saleTotalMinor,canTransitionOrder,validateCreditPolicy,creditExposure,validateCreditSale,applyPayment});
});
