// Shared metric layout. The scene and the geometry checks consume the same data.
export function createLayout(dem, landmarks) {
  const [mx,mz]=dem.metresPerDegree;
  const geo=(lon,lat)=>[(lon-dem.origin.lon)*mx,(dem.origin.lat-lat)*mz];
  function footprint(id){
    const points=landmarks[id].points.slice(0,-1).map(p=>geo(...p));
    let best=null;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle);
      const q=points.map(([x,z])=>[x*c+z*s,-x*s+z*c]);
      const lo=[0,1].map(k=>Math.min(...q.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...q.map(p=>p[k])));
      const w=hi[0]-lo[0],d=hi[1]-lo[1],area=w*d;
      if(!best||area<best.boxArea){
        const cx=(hi[0]+lo[0])/2,cz=(hi[1]+lo[1])/2;
        const longAngle=w>=d?angle:angle+Math.PI/2;
        let yaw=Math.PI/2-longAngle;while(yaw>Math.PI/2)yaw-=Math.PI;while(yaw<-Math.PI/2)yaw+=Math.PI;
        best={center:[cx*c-cz*s,cx*s+cz*c],width:Math.min(w,d),depth:Math.max(w,d),yaw,boxArea:area};
      }
    }
    best.area=Math.abs(points.reduce((a,p,i)=>{const q=points[(i+1)%points.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2;
    best.points=points;best.osmWay=id;return best;
  }
  const mosque=footprint('1081117581'),bath=footprint('1090339941');
  // Latest user map: approximately square, with the south edge just above the
  // coastal road. The screenshot's area-derived 1.63 km is the adopted side length.
  // South midpoint is registered against Nicomedia and the road junction below it.
  const width=1630,length=1630,angle=2.75*Math.PI/180;
  const u=[Math.cos(angle),Math.sin(angle)],v=[Math.sin(angle),-Math.cos(angle)];
  const southMid=geo(29.92048,40.765535);
  const city=(a,b)=>southMid.map((p,i)=>p+u[i]*a+v[i]*b);
  const cityCoords=p=>{const q=p.map((x,i)=>x-southMid[i]);return [q[0]*u[0]+q[1]*u[1],q[0]*v[0]+q[1]*v[1]];};
  const boundary=[city(-width/2,0),city(width/2,0),city(width/2,length),city(-width/2,length)];
  // The orange route on the supplied itiner-e map. Coordinates retained from
  // the project's itiner-e data (segment 24043), not from modern motorway lanes.
  const roadGeo=[[29.920013,40.764096],[29.920158,40.774527],[29.927869,40.784135]];
  const roadTrace=roadGeo.map(p=>geo(...p));
  const mainAt=b=>{
    for(let i=1;i<roadTrace.length;i++){
      const a=roadTrace[i-1],c=roadTrace[i],ab=cityCoords(a)[1],cb=cityCoords(c)[1];
      if(b>=Math.min(ab,cb)&&b<=Math.max(ab,cb)){const t=(b-ab)/(cb-ab);return a.map((x,j)=>x+t*(c[j]-x));}
    }
    throw new Error(`Road does not cross city depth ${b}`);
  };
  const southGate=mainAt(0),northGate=mainAt(length),gateAcross=cityCoords(southGate)[0];
  const fortAcross=gateAcross-120;
  // An interior garrison fortress: its south curtain joins the south city wall.
  // The castle is close west of the main gate; both modern landmarks stay fixed.
  const fort={center:city(fortAcross,43),width:100,depth:86,yaw:-angle};
  const fortEntry=city(fortAcross,86),fortJoin={edge:0,from:fortAcross-50+width/2,to:fortAcross+50+width/2};
  const posternAcross=cityCoords(bath.center)[0],postern=city(posternAcross,0);
  const harbor=[-330,1465],camp=city(gateAcross+320,-240);
  const mainRoad=[harbor,roadTrace[0],southGate,roadTrace[1],northGate,mainAt(length+250)];
  const minorRoads=[
    {points:[camp,mainAt(-145)],width:6},
    {points:[southGate,mainAt(90),mosque.center,bath.center,postern],width:6},
    {points:[mainAt(115),fortEntry],width:6},
    {points:[postern,city(posternAcross,-90),mainAt(-145)],width:5},
    ...[370,720,1100,1430].map(b=>({points:[city(-600,b),mainAt(b),city(610,b)],width:7})),
    {points:[mosque.center,city(-260,450),city(-300,900),city(-260,1430)],width:6},
    {points:[bath.center,city(360,390),city(400,720),city(400,1100),city(400,1430)],width:6},
    {points:[[-1500,1370],[-800,1390],harbor,[420,1440],[1100,1380],[2100,1320]],width:7}
  ];
  const toGeo=p=>[dem.origin.lon+p[0]/mx,dem.origin.lat-p[1]/mz];
  return {mosque,bath,fort,boundary,southGate,southMid,postern,northGate,harbor,camp,mainRoad,minorRoads,fortEntry,fortJoin,u,v,angle,
    width,length,area:width*length,city,cityCoords,mainAt,toGeo,gateAcross,fortAcross,roadGeo,
    gates:[{point:southGate,width:12,yaw:-angle,name:'主城门'},
      {point:postern,width:6,yaw:-angle,name:'浴场偏门'},
      {point:northGate,width:9,yaw:-angle,name:'北侧城门'}]};
}
