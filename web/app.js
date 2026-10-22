/* QProof app - part loader; parts in web/qp0.js..qpN.js */
(function(){
  var p=window.__QP_PARTS; if(!p){console.error('QProof parts missing');return;}
  (0,eval)(p.join(''));
})();
