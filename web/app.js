/* QProof app - part loader */
(function(){
  var p=window.__QP_PARTS; if(!p){console.error('QProof parts missing');return;}
  (0,eval)(p.join(''));
})();
