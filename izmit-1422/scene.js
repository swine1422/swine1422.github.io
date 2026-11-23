import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLayout } from './layout.js?v=20261123-interior-fort';

const $ = id => document.getElementById(id);
const error = e => { $('loading').hidden = true; $('error').hidden = false; $('error').textContent = `场景未能载入：${e.message}。请通过本地服务器打开此页面。`; console.error(e); };
window.addEventListener('error', e => error(e.error || new Error(e.message)));
window.addEventListener('unhandledrejection', e => error(e.reason));

const [dem, landmarks, coast] = await Promise.all(['terrain','landmarks','coastline'].map(async n => {
  const r = await fetch(`./data/${n}.json`); if (!r.ok) throw new Error(`${n} 数据读取失败`); return r.json();
}));
const origin = dem.origin, [mx,mz] = dem.metresPerDegree;
const [xmin,xmax,zmin,zmax] = dem.bounds;
const geo = (lon,lat) => [(lon-origin.lon)*mx,(origin.lat-lat)*mz];
const clamp = THREE.MathUtils.clamp;
const layout=createLayout(dem,landmarks);
const {boundary,southGate,postern,northGate,harbor,camp,mainRoad}=layout;
const mosqueCenter=layout.mosque.center,bathCenter=layout.bath.center,fortCenter=layout.fort.center;
// Simplify the modern mapped coastline into a continuous bay edge. Modern jetty
// outlines are omitted; this is a coastline reference, not a dated medieval survey.
const coastSegments=coast.ways.flatMap(w=>w.points.slice(1).map((p,i)=>[geo(...w.points[i]),geo(...p)]));
const shoreSamples=[];
for(let x=-3100;x<=1750;x+=25){
  const zs=[];for(const [a,b] of coastSegments){if(x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&Math.abs(b[0]-a[0])>.01){const t=(x-a[0])/(b[0]-a[0]);zs.push(a[1]+t*(b[1]-a[1]));}}
  if(zs.length)shoreSamples.push([x,Math.min(...zs)]);
}
const smoothShore=shoreSamples.map((p,i)=>[p[0],shoreSamples.slice(Math.max(0,i-2),i+3).reduce((s,q)=>s+q[1],0)/shoreSamples.slice(Math.max(0,i-2),i+3).length]);
function shore(x){let i=clamp(Math.floor((x-smoothShore[0][0])/25),0,smoothShore.length-2);const a=smoothShore[i],b=smoothShore[i+1],t=clamp((x-a[0])/(b[0]-a[0]),0,1);return a[1]+(b[1]-a[1])*t;}
function rawHeight(x,z) {
  const u=clamp((x-xmin)/(xmax-xmin)*(dem.nx-1),0,dem.nx-1.001),v=clamp((z-zmin)/(zmax-zmin)*(dem.nz-1),0,dem.nz-1.001);
  const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*dem.nx+i;
  return dem.heights[k]*(1-a)*(1-b)+dem.heights[k+1]*a*(1-b)+dem.heights[k+dem.nx]*(1-a)*b+dem.heights[k+dem.nx+1]*a*b;
}
const earthworks=[
  {p:mosqueCenter,w:34,d:44,yaw:layout.mosque.yaw},
  {p:bathCenter,w:24,d:27,yaw:layout.bath.yaw},
  {p:fortCenter,w:104,d:90,yaw:layout.fort.yaw}
];
function height(x,z){
  let h=rawHeight(x,z);
  const ds=z-shore(x);if(ds>0)h=-Math.min(7,ds*.16);else if(ds>-25)h=Math.max(.8,-ds*.09);
  for(const p of earthworks){
    const dx=x-p.p[0],dz=z-p.p[1],lx=dx*Math.cos(p.yaw)-dz*Math.sin(p.yaw),lz=dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw);
    const edge=Math.max(Math.abs(lx)-p.w/2,Math.abs(lz)-p.d/2);
    if(edge<16){const t=1-clamp(edge/16,0,1),f=t*t*(3-2*t);h=h*(1-f)+rawHeight(...p.p)*f;}
  }return h;
}
let seed=1422;
function rnd(){ seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; }
const v3 = (x,z,dy=0) => new THREE.Vector3(x,height(x,z)+dy,z);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8eee6');
scene.fog = new THREE.Fog('#e8eee6',4300,11000);
const camera = new THREE.PerspectiveCamera(39,innerWidth/innerHeight,0.5,20000);
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('scene').append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=.075;
controls.maxPolarAngle=Math.PI*.475;controls.minDistance=30;controls.maxDistance=8200;controls.zoomSpeed=.8;controls.panSpeed=.7;
scene.add(new THREE.HemisphereLight('#e8f1ff','#8d9475',1.45));
const sun=new THREE.DirectionalLight('#fff0d4',2.7);sun.position.set(-1700,1600,1500);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2300;sun.shadow.camera.right=2300;sun.shadow.camera.top=2400;sun.shadow.camera.bottom=-2300;sun.shadow.camera.near=100;sun.shadow.camera.far=6000;sun.shadow.normalBias=.6;sun.shadow.bias=-.00005;scene.add(sun);

const material=(color,more={})=>new THREE.MeshStandardMaterial({color,roughness:.93,...more});
function masonryTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#9e9782';g.fillRect(0,0,256,256);
  for(let row=0;row<16;row++)for(let col=-1;col<8;col++){
    const b=151+Math.floor(rnd()*45);g.fillStyle=`rgb(${b+15},${b+8},${b-12})`;g.fillRect(col*38+(row%2)*19+1,row*16+1,36,14);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
const mats={stone:material('#d2c2a3',{map:masonryTexture()}),plaster:material('#e5d8bc'),trim:material('#d7c8a7'),roof:material('#8e4c35'),roofLight:material('#a86545'),wood:material('#644b31'),dark:material('#283831'),iron:material('#405953'),ground:material('#c5b28d'),cloth:material('#d9c5a0'),trunk:material('#6e6145'),leaf:material('#617b4d'),leaf2:material('#7a8655'),water:material('#407c82',{roughness:.36,metalness:.23})};
const boxGeo=new THREE.BoxGeometry(1,1,1);
function box(parent,x,y,z,w,h,d,mat=mats.stone){const m=new THREE.Mesh(boxGeo,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function cylinder(parent,x,y,z,r1,r2,h,mat=mats.stone,n=12){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,n),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function ball(parent,x,y,z,r,mat=mats.leaf,scale=[1,1,1]){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),mat);m.position.set(x,y,z);m.scale.set(...scale);m.castShadow=true;parent.add(m);return m;}
function hipGeometry(w,d,h){
  const x=w/2,z=d/2,ridge=Math.max(0,(d-w)/2);
  const p=[[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z],[0,h,-ridge],[0,h,ridge]];
  const faces=[[0,4,1],[1,4,5],[1,5,2],[2,5,3],[3,5,4],[3,4,0],[0,1,2],[0,2,3]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(i=>p[i])),3));g.computeVertexNormals();return g;
}
function roof(parent,x,y,z,w,d,h,mat=mats.roof){const m=new THREE.Mesh(hipGeometry(w,d,h),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function arch(parent,x,y,z,w,h,mat=mats.dark,rot=0){
  const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h-w/2);s.absarc(0,h-w/2,w/2,0,Math.PI,false);s.lineTo(-w/2,0);
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(s,12),mat);mesh.position.set(x,y,z);mesh.rotation.y=rot;parent.add(mesh);return mesh;
}
function dome(parent,x,y,z,r,h=r){const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,12,0,Math.PI*2,0,Math.PI/2),mats.roofLight);m.position.set(x,y,z);m.scale.y=h/r;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function batch(group){
  // Merge static geometry by material; preserve the landmark's parent for picking.
  group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert();const buckets=new Map();
  group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));
    if(g.index){const n=g.toNonIndexed();g.dispose();if(!buckets.has(o.material))buckets.set(o.material,[]);buckets.get(o.material).push(n);}else{if(!buckets.has(o.material))buckets.set(o.material,[]);buckets.get(o.material).push(g);}});
  group.clear();for(const [mat,gs] of buckets){
    for(const g of gs)for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
    const allUV=gs.every(g=>g.getAttribute('uv'));if(!allUV)for(const g of gs)g.deleteAttribute('uv');
    const merged=mergeGeometries(gs,false);const m=new THREE.Mesh(merged,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);gs.forEach(g=>g.dispose());
  }
}

// Local metre coordinates: +x east, -z north; every terrain vertex is sampled DEM.
const terrainGeo=new THREE.PlaneGeometry(xmax-xmin,zmax-zmin,600,600);terrainGeo.rotateX(-Math.PI/2);terrainGeo.translate((xmin+xmax)/2,0,(zmin+zmax)/2);
const pos=terrainGeo.attributes.position, colors=[];
for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),h=height(x,z);pos.setY(i,h);
  const n=(Math.sin(x*.009)+Math.cos(z*.011)+Math.sin((x+z)*.017))*.027;
  const col=new THREE.Color('#83916a').offsetHSL(n*.12,n*.3,n*.25+Math.min(h,300)*.000015);
  if(h<10) col.set('#b8af87').offsetHSL(0,0,n*.15);
  if(h<1) col.set('#78978a');
  colors.push(col.r,col.g,col.b);
}
terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();
const terrain=new THREE.Mesh(terrainGeo,material('#ffffff',{vertexColors:true}));terrain.receiveShadow=true;scene.add(terrain);
// Paint roads onto the terrain surface, avoiding floating or half-buried ribbons.
const roadCanvas=document.createElement('canvas');roadCanvas.width=roadCanvas.height=4096;
const roadContext=roadCanvas.getContext('2d'),roadTexture=new THREE.CanvasTexture(roadCanvas),roadHighlight={value:1};
function paintRoad(points,width,color='white'){
  roadContext.strokeStyle=color;roadContext.lineWidth=width/(xmax-xmin)*4096;roadContext.lineCap='round';roadContext.lineJoin='round';roadContext.beginPath();
  points.forEach(([x,z],i)=>roadContext[i?'lineTo':'moveTo']((x-xmin)/(xmax-xmin)*4096,(z-zmin)/(zmax-zmin)*4096));roadContext.stroke();roadTexture.needsUpdate=true;
}
terrain.material.onBeforeCompile=shader=>{
  shader.uniforms.roadMap={value:roadTexture};shader.uniforms.roadHighlight=roadHighlight;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vRoadUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nvRoadUv=uv;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D roadMap; uniform float roadHighlight; varying vec2 vRoadUv;').replace('#include <color_fragment>','#include <color_fragment>\nvec4 road=texture2D(roadMap,vRoadUv); vec3 earth=vec3(0.56,0.44,0.28); vec3 orange=vec3(0.72,0.32,0.07); vec3 roadColor=mix(earth,orange,roadHighlight*(1.0-road.g)); diffuseColor.rgb=mix(diffuseColor.rgb,roadColor,road.a);');
};
function surfaceHeight(x,z){
  const u=clamp((x-xmin)/(xmax-xmin)*600,0,599.999),v=clamp((z-zmin)/(zmax-zmin)*600,0,599.999),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*601+i;
  const h00=pos.getY(k),h10=pos.getY(k+1),h01=pos.getY(k+601),h11=pos.getY(k+602);
  return a+b<=1?h00+a*(h10-h00)+b*(h01-h00):h11+(1-a)*(h01-h11)+(1-b)*(h10-h11);
}
const water=new THREE.Mesh(new THREE.PlaneGeometry(13500,9000),mats.water);water.rotation.x=-Math.PI/2;water.position.set(0,.6,5700);water.receiveShadow=true;scene.add(water);
// Procedural light ripples; no aerial imagery or modern road texture is used.
mats.water.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;').replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(vWaterWorld.x*.12+vWaterWorld.z*.31)*sin(vWaterWorld.x*.029-vWaterWorld.z*.017); diffuseColor.rgb*=0.97+0.045*ripple;');
};

// User-specified 1.63 km square registered to the latest modern-map reference.
function inside(x,z,poly=boundary){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[d,e]=poly[j];if(((b>z)!==(e>z))&&(x<(d-a)*(z-b)/(e-b)+a))c=!c;}return c;}
const siteData={
  mosque:{name:'苏莱曼帕夏清真寺',short:'01 清真寺',kicker:'01 / GAZİ SÜLEYMAN PAŞA CAMİİ',p:mosqueCenter,meta:'40.768501° N · 29.919695° E｜18.4 × 29.1 m',text:'按现代 Orhan Camii 建筑轮廓定位，在主门西北侧、南城墙内约330米。建筑朝向与主体长宽保持现代地图尺度；院落和1422年外观作体量复原。',radius:80},
  bath:{name:'苏莱曼帕夏大浴场',short:'02 大浴场',kicker:'02 / SÜLEYMAN PAŞA HAMAMI',p:bathCenter,meta:'40.766990° N · 29.920699° E｜18.6 × 21.1 m',text:'按现代 Süleyman Paşa Hamamı 轮廓定位，在清真寺东南约188米、南城墙内约160米。附近设置通往城外的偏门，保留小说中民兵由此出城的关系。',radius:65},
  fort:{name:'罗马堡垒 · 驻军军营',short:'03 罗马堡垒',kicker:'03 / FICTIONAL GARRISON FORT',p:fortCenter,meta:'主门西侧城内 · 南侧堡墙接南城墙',text:'按小说需要布置在主门西侧的城墙内，南侧堡墙与南城墙共线。北侧堡门朝向城区，并由短路连接主干道；最近接墙端距主门70米。堡垒平面100 × 86米，位置为小说设定。',radius:135}
};
function terrainPad(group,x,z,w,d,mat=mats.ground){const y=height(x,z);const low=Math.min(...[-1,1].flatMap(a=>[-1,1].map(b=>height(x+a*w/2,z+b*d/2))))-1;box(group,x,(y+low)/2,z,w,y-low+1,d,mat);return y+.5;}
const civil=new THREE.Group();scene.add(civil);
const roads=[];
function ribbon(points,width,mat=mats.ground,offset=.5,parent=civil){
  const samples=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));for(let k=0;k<n;k++){const t=k/n;samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}samples.push(points.at(-1));
  const verts=[],idx=[];samples.forEach((p,i)=>{const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz),nx=-dz/l*width/2,nz=dx/l*width/2;for(const s of [-1,1])verts.push(p[0]+nx*s,surfaceHeight(p[0]+nx*s,p[1]+nz*s)+offset,p[1]+nz*s);if(i<samples.length-1){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.receiveShadow=true;parent.add(m);return m;
}
function road(points,width=7){roads.push({points,width});paintRoad(points,width);}
road(mainRoad,12);
layout.minorRoads.forEach(r=>road(r.points,r.width));
function distanceSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
function roadDistance(x,z){return Math.min(...roads.flatMap(r=>r.points.slice(1).map((b,i)=>distanceSegment(x,z,r.points[i],b)-r.width/2)));}
function wallDistance(x,z){return Math.min(...boundary.map((a,i)=>distanceSegment(x,z,a,boundary[(i+1)%boundary.length])));}

const walls=new THREE.Group();scene.add(walls);
function battlement(parent,x,y,z,w=10,d=10){
  box(parent,x,y-.5,z,w,1,d,mats.trim);
  for(let k=-w/2+1;k<w/2;k+=3){box(parent,x+k,y+1,z-d/2+.6,1.5,2,1.2);box(parent,x+k,y+1,z+d/2-.6,1.5,2,1.2);}
  for(let k=-d/2+3;k<d/2-1;k+=3){box(parent,x-w/2+.6,y+1,z+k,1.2,2,1.5);box(parent,x+w/2-.6,y+1,z+k,1.2,2,1.5);}
}
function tower(parent,x,z,w=12,h=16){const y=height(x,z);box(parent,x,y+h/2-1,z,w,h+2,w);battlement(parent,x,y+h,z,w+1,w+1);for(const s of [-1,1])box(parent,x+s*w*.501,y+h-5,z,.12,3,.6,mats.dark);}
function gateAt(point,width,yaw){
  const g=new THREE.Group();g.position.copy(v3(...point));g.rotation.y=yaw;walls.add(g);
  const ht=width>9?12:9;
  box(g,0,ht-2,0,width+6,4,5);box(g,-width/2-2,(ht-3)/2,0,4,ht-3,5);box(g,width/2+2,(ht-3)/2,0,4,ht-3,5);
  const shape=new THREE.Shape();shape.moveTo(-width/2,0);shape.lineTo(width/2,0);shape.lineTo(width/2,ht-4);shape.absarc(0,ht-4,width/2,0,Math.PI,false);shape.lineTo(-width/2,0);
  // Two open timber leaves, deliberately leaving a traversable portal.
  for(const s of [-1,1]){const leaf=box(g,s*(width/2-.3),(ht-3)/2,2,width/2,ht-3,.5,mats.wood);leaf.rotation.y=s*.95;}
  for(let x=-width/2-3;x<width/2+3;x+=3)box(g,x,ht+1,0,1.5,2,4);
}
for(let j=0;j<boundary.length;j++){
  const a=boundary[j],b=boundary[(j+1)%boundary.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len,yaw=-Math.atan2(dz,dx);
  const cuts=layout.gates.filter(g=>distanceSegment(...g.point,a,b)<.01).map(g=>{
    const at=(g.point[0]-a[0])*dx+(g.point[1]-a[1])*dz;
    return [at-g.width/2,at+g.width/2];
  });
  if(j===layout.fortJoin.edge)cuts.push([layout.fortJoin.from,layout.fortJoin.to]);
  cuts.sort((p,q)=>p[0]-q[0]);
  const spans=[];let start=0;
  for(const [lo,hi] of cuts){if(lo>start)spans.push([start,lo]);start=Math.max(start,hi);}
  if(start<len)spans.push([start,len]);
  // Build up to the exact gate / castle limits, rather than dropping whole segments.
  for(const [lo,hi] of spans){const n=Math.ceil((hi-lo)/9),step=(hi-lo)/n;
    for(let i=0;i<n;i++){
      const at=lo+(i+.5)*step,x=a[0]+at*dx,z=a[1]+at*dz,y=height(x,z);
      const m=box(walls,x,y+4.6,z,step,11.2,3.8);m.rotation.y=yaw;
      for(const sign of [-1,1]){const c=box(walls,x+sign*step/3*dx,y+11.1,z+sign*step/3*dz,1.7,2.2,3.9);c.rotation.y=yaw;}
    }
  }
  const nt=Math.max(1,Math.floor(len/140));
  for(let k=0;k<nt;k++){const at=k/nt*len;if(cuts.some(([lo,hi])=>at>lo-18&&at<hi+18))continue;tower(walls,a[0]+at*dx,a[1]+at*dz,12,15);}
}
layout.gates.forEach(g=>gateAt(g.point,g.width,g.yaw));
batch(walls);

// Landmark architecture is kept at metre scale, not enlarged as map icons.
const pickable=[];
function landmarkGroup(id){const g=new THREE.Group(),p=siteData[id].p;g.position.copy(v3(...p,.7));g.userData.site=id;scene.add(g);pickable.push(g);return g;}
const mosque=landmarkGroup('mosque');mosque.rotation.y=layout.mosque.yaw;
const mw=layout.mosque.width,md=layout.mosque.depth;
box(mosque,0,-2,0,32,4,42,mats.stone);box(mosque,0,.1,0,31,.5,41,mats.ground);
box(mosque,0,4,3,16.7,8,21.5,mats.plaster);box(mosque,0,8.2,3,17.3,.4,22.1,mats.trim);
roof(mosque,0,8.4,2.9,mw,md-5.8,3.6);
// Entrance porch occupies the northern 5.8 m of the measured 29.1 m envelope.
box(mosque,0,4.4,-11.65,16.7,.5,5.1,mats.wood);roof(mosque,0,4.7,-(md/2-2.9),mw,5.8,1.7);
for(let x=-7.4;x<=7.5;x+=3.7)cylinder(mosque,x,2.2,-13.7,.16,.2,4.5,mats.trim,8);
arch(mosque,0,.3,-7.77,2.1,4.2,mats.dark,Math.PI);
for(const t of [-1,1])for(const z of [-4,2.5,9])arch(mosque,t*8.37,1.8,z,1.5,3.8,mats.dark,t*Math.PI/2);
for(const x of [-5,0,5])arch(mosque,x,1.8,13.77,1.5,3.8);
cylinder(mosque,-11,2,-4,2,2.3,4);cylinder(mosque,-11,11,-4,1.2,1.6,14,mats.trim,16);cylinder(mosque,-11,18.4,-4,2,1.4,1.2,mats.trim,16);cylinder(mosque,-11,21.5,-4,.9,1,5,mats.plaster,16);cylinder(mosque,-11,25.5,-4,0,1.3,3.5,mats.iron,16);cylinder(mosque,-11,27.7,-4,.07,.1,.9,mats.iron,8);
for(let i=0;i<12;i++){const a=i*Math.PI/6;cylinder(mosque,-11+Math.cos(a)*1.8,19.5,-4+Math.sin(a)*1.8,.08,.08,1.2,mats.trim,6);}
cylinder(mosque,9,.7,-18,2.1,2.3,1,mats.trim,10);cylinder(mosque,9,1.4,-18,.35,.5,1.4,mats.trim,10);
for(const t of [-1,1])box(mosque,t*15.5,.8,0,.6,1.4,41,mats.trim);
box(mosque,0,.8,20.5,31,1.4,.6,mats.trim);
batch(mosque);

const bath=landmarkGroup('bath');bath.rotation.y=layout.bath.yaw;
const bw=layout.bath.width,bd=layout.bath.depth;
box(bath,0,-1.5,0,24,3,27,mats.stone);box(bath,0,2.4,0,bw-1,4.8,bd-1,mats.stone);box(bath,0,4.9,0,bw,.3,bd,mats.roof);
for(const x of [-4.5,4.5]){
  dome(bath,x,5.05,-4.7,4.25,3.5);dome(bath,x,5.05,4.8,3.55,2.7);
  cylinder(bath,x,8.9,-4.7,.5,.5,.6,mats.trim,10);dome(bath,x,9.2,-4.7,.7,.4);
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;cylinder(bath,x+Math.cos(a)*1.9,7.85,-4.7+Math.sin(a)*1.9,.21,.25,.4,mats.trim,6);}
  arch(bath,x,.1,(bd-1)/2+.02,1.8,3.4);
}
box(bath,7.3,4.7,8,1.3,9.4,1.4,mats.roofLight);box(bath,7.3,9.4,8,1.8,.5,1.8,mats.trim);
batch(bath);

const fort=landmarkGroup('fort');fort.rotation.y=layout.fort.yaw;
const fw=layout.fort.width,fd=layout.fort.depth,fy=height(...fortCenter);
box(fort,0,-7,0,fw,14,fd,mats.stone);box(fort,0,.2,0,94,.6,80,mats.ground);
for(const s of [-1,1])box(fort,s*48,5,0,4,10,fd);
box(fort,0,5,41,fw,10,4);box(fort,-31,5,-41,38,10,4);box(fort,31,5,-41,38,10,4);box(fort,0,9,-41,24,3,4);
for(const x of [-43,43])for(const z of [-36,36]){box(fort,x,8,z,15,16,15);battlement(fort,x,16,z,16,16);for(const s of [-1,1])box(fort,x+s*7.51,11,z,.1,3,.7,mats.dark);}
for(let x=-33;x<=33;x+=4){box(fort,x,10.7,-41,2,2.4,4);box(fort,x,10.7,41,2,2.4,4);}
for(let z=-25;z<=25;z+=4)for(const s of [-1,1])box(fort,s*48,10.7,z,4,2.4,2);
box(fort,-30,3.5,-5,17,7,48,mats.plaster);roof(fort,-30,7,-5,19,50,4);box(fort,20,3.5,-25,35,7,14,mats.plaster);roof(fort,20,7,-25,37,16,4);
for(let z=-20;z<20;z+=8)arch(fort,-21.48,.6,z,2,3.2,mats.dark,Math.PI/2);
for(let x=-2;x<36;x+=7)arch(fort,x,.6,-17.98,2,3.4);
// Steps to the wall walk, stores and water cistern in the garrison court.
for(let i=0;i<14;i++)box(fort,38, i*.35,18-i*1.3,6,.7+i*.7,1.3);
cylinder(fort,0,.8,-9,4,4,1.5,mats.trim,12);cylinder(fort,0,1.6,-9,3.1,3.1,.3,mats.water,12);
for(let i=0;i<8;i++)box(fort,17+(i%4)*3,1.2,20+Math.floor(i/4)*3,2.4,2.4,2.4,mats.wood);
batch(fort);

// The garrison is inside the city. Its south curtain joins the city wall; its north entry faces the streets.

function house(parent,x,z,w,d,h,yaw){
  const g=new THREE.Group(),y=height(x,z);g.position.set(x,y,z);g.rotation.y=yaw;parent.add(g);
  const low=Math.min(height(x-w/2,z-d/2),height(x+w/2,z+d/2))-y-1;
  box(g,0,low/2,0,w,-low,d,mats.stone);box(g,0,h/2,0,w,h,d,mats.plaster);box(g,0,h*.42,0,w+.1,.25,d+.1,mats.wood);roof(g,0,h,0,w+1.3,d+1.3,w*.32,rnd()>.5?mats.roof:mats.roofLight);
  box(g,w*.12,1.2,d/2+.03,1.3,2.4,.08,mats.dark);
  for(const s of [-1,1]){box(g,s*w*.26,h*.68,d/2+.05,1.1,1.2,.08,mats.dark);box(g,s*w/2+.02,h*.65,0,.08,1.3,1.2,mats.dark);}
  return g;
}
const homes=new THREE.Group();scene.add(homes);const homePositions=[];
function reserved(x,z){return Math.hypot(x-mosqueCenter[0],z-mosqueCenter[1])<64||Math.hypot(x-bathCenter[0],z-bathCenter[1])<43||Math.abs(x-fortCenter[0])<72&&Math.abs(z-fortCenter[1])<67;}
let tries=0;
while(homePositions.length<400&&tries++<26000){
  const [x,z]=layout.city(-layout.width/2+40+rnd()*(layout.width-80),30+rnd()*(layout.length-60));
  if(!inside(x,z)||wallDistance(x,z)<27||reserved(x,z))continue;
  const rd=roadDistance(x,z);if(rd<10||rd>100+rnd()*100||z<-650&&rnd()>.16)continue;
  if(homePositions.some(p=>Math.hypot(x-p[0],z-p[1])<21))continue;
  const w=7+rnd()*7,d=9+rnd()*8,h=4.5+rnd()*4;
  if(Math.abs(height(x+8,z+8)-height(x-8,z-8))>11)continue;
  house(homes,x,z,w,d,h,Math.floor(rnd()*4)*Math.PI/2+(rnd()-.5)*.5);homePositions.push([x,z]);
}
// A compact waterfront of storehouses, not a modern urban grid.
const portHomes=[];
for(let i=0;i<65;i++){const x=-1010+rnd()*1420,z=1280+rnd()*100;if(height(x,z)<2.5||roadDistance(x,z)<11||portHomes.some(p=>Math.hypot(x-p[0],z-p[1])<22))continue;house(homes,x,z,9+rnd()*7,13+rnd()*12,5+rnd()*2,(rnd()-.5)*.3);portHomes.push([x,z]);}
batch(homes);batch(civil);civil.traverse(o=>{if(o.isMesh)o.castShadow=false;});
paintRoad(mainRoad,12,'red');

const harborGroup=new THREE.Group();scene.add(harborGroup);
function pier(x,z,len){const y=2.6;box(harborGroup,x,y,z+len/2,12,1,len,mats.wood);for(let d=0;d<len;d+=12)for(const s of [-1,1])cylinder(harborGroup,x+s*5,.7,z+d,.5,.5,5,mats.wood,7);for(let d=0;d<len;d+=3)box(harborGroup,x,y+.56,z+d,12,.12,.13,mats.trim);}
pier(-330,1450,82);pier(-470,1470,70);pier(-130,1480,100);
function ship(x,z,len=30,yaw=0){
  const g=new THREE.Group();g.position.set(x,1.1,z);g.rotation.y=yaw;harborGroup.add(g);
  const s=new THREE.Shape();s.moveTo(0,-len/2);s.quadraticCurveTo(len*.23,-len*.3,len*.15,len*.3);s.quadraticCurveTo(0,len*.65,-len*.15,len*.3);s.quadraticCurveTo(-len*.23,-len*.3,0,-len/2);
  const hull=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:2.4,bevelEnabled:true,bevelSize:1.5,bevelThickness:1,bevelSegments:1,steps:1}),mats.wood);hull.rotation.x=Math.PI/2;hull.position.y=2.2;hull.castShadow=true;g.add(hull);
  box(g,0,2.3,0,len*.26,.4,len*.7,mats.ground);cylinder(g,0,10,0,.25,.4,18,mats.wood,8);
  const sailG=new THREE.BufferGeometry();sailG.setAttribute('position',new THREE.Float32BufferAttribute([0,18,0,0,4,len*.45,0,5,-len*.23],3));sailG.computeVertexNormals();const sail=new THREE.Mesh(sailG,material('#e7d4ad',{side:THREE.DoubleSide}));g.add(sail);
}
ship(-350,1505,35,.05);ship(-450,1510,28,-.15);ship(-150,1560,37,.2);ship(-650,1750,42,-.7);ship(180,1780,28,.35);
batch(harborGroup);

const tents=new THREE.Group();scene.add(tents);
for(let row=0;row<5;row++)for(let col=0;col<7;col++){
  const x=camp[0]-105+col*25+(rnd()-.5)*6,z=camp[1]-53+row*26;
  if(roadDistance(x,z)<10)continue;
  const y=height(x,z),g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=.2;tents.add(g);
  roof(g,0,.2,0,9,13,5,mats.cloth);box(g,0,1.7,6.51,2.2,3.5,.05,mats.dark);cylinder(g,0,2.7,6,.12,.12,5.5,mats.wood,6);
}
// A few carts and field stores retain the camp's military scale without staging new plot.
for(let k=0;k<5;k++){const x=camp[0]-50+k*19,z=camp[1]+85,y=height(x,z);box(tents,x,y+1.6,z,3,1,5,mats.wood);for(const s of [-1,1]){const w=cylinder(tents,x+s*1.8,y+.9,z,.9,.9,.35,mats.wood,10);w.rotation.z=Math.PI/2;}}
batch(tents);

// Instanced olive/pine canopy: efficient, deterministic and clear of buildings and roads.
const treePositions=[];
for(let i=0;i<10500&&treePositions.length<2400;i++){
  const x=-2400+rnd()*4800,z=-2200+rnd()*3550,h=height(x,z),inCity=inside(x,z);
  if(h<10||reserved(x,z)||roadDistance(x,z)<10||wallDistance(x,z)<15||Math.hypot(x-camp[0],z-camp[1])<150)continue;
  if(homePositions.some(p=>Math.hypot(x-p[0],z-p[1])<13)||portHomes.some(p=>Math.hypot(x-p[0],z-p[1])<13))continue;
  if(inCity&&rnd()>.27)continue;
  treePositions.push([x,h,z,4+rnd()*5,rnd()]);
}
const trunkMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.45,.65,1,6),mats.trunk,treePositions.length);
const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mats.leaf,treePositions.length);
const pine=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,7),mats.leaf2,treePositions.length);
const dummy=new THREE.Object3D(),tcolor=new THREE.Color();
treePositions.forEach(([x,y,z,size,type],i)=>{
  dummy.position.set(x,y+size*.36,z);dummy.scale.set(1,size*.75,1);dummy.updateMatrix();trunkMesh.setMatrixAt(i,dummy.matrix);
  dummy.position.set(x,y+size,z);dummy.scale.set(size*.65,size*.7,size*.62);dummy.rotation.y=type*7;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);crowns.setColorAt(i,tcolor.setHSL(.2+type*.04,.2+type*.1,.27+type*.08));
  dummy.position.set(x,y+size,z);dummy.scale.set(type>.78?size*.6:0,type>.78?size*1.7:0,type>.78?size*.6:0);dummy.updateMatrix();pine.setMatrixAt(i,dummy.matrix);
});
for(const mesh of [trunkMesh,crowns,pine]){mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);}

// Low terraces and planting strips on open northern slopes, no modern roads/buildings.
const fields=new THREE.Group();scene.add(fields);
for(let k=0;k<26;k++){
  const x=-500+rnd()*1050,z=-1300+rnd()*1100;if(!inside(x,z)||roadDistance(x,z)<60||homePositions.some(p=>Math.hypot(x-p[0],z-p[1])<70))continue;
  for(let i=0;i<5;i++)ribbon([[x-30,z+i*5],[x+20,z+i*5-5],[x+60,z+i*5-15]],2.5,material(i%2?'#8a8b5d':'#9b986d'),.25,fields);
}batch(fields);

const contours=new THREE.Group();scene.add(contours);contours.visible=false;
const contourMat=new THREE.LineBasicMaterial({color:'#596f59',transparent:true,opacity:.32,depthWrite:false});
const contourVerts=[];
for(let level=20;level<300;level+=20){
  for(let j=0;j<dem.nz-1;j++)for(let i=0;i<dem.nx-1;i++){
    const k=j*dem.nx+i,hs=[dem.heights[k],dem.heights[k+1],dem.heights[k+dem.nx+1],dem.heights[k+dem.nx]],xy=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]],hits=[];
    for(let t=0;t<4;t++){const n=(t+1)%4;if((hs[t]<level)===(hs[n]<level))continue;const f=(level-hs[t])/(hs[n]-hs[t]);hits.push([xmin+(xy[t][0]+f*(xy[n][0]-xy[t][0]))/(dem.nx-1)*(xmax-xmin),level+.7,zmin+(xy[t][1]+f*(xy[n][1]-xy[t][1]))/(dem.nz-1)*(zmax-zmin)]);}
    for(let t=0;t+1<hits.length;t+=2)contourVerts.push(...hits[t],...hits[t+1]);
  }
}
const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.Float32BufferAttribute(contourVerts,3));contours.add(new THREE.LineSegments(cg,contourMat));
const route=new THREE.Group();scene.add(route);route.visible=true;
const routeMat=material('#f1bf62',{emissive:'#8d5421',emissiveIntensity:.3,depthTest:false});
for(const p of [harbor,southGate,northGate]){const m=new THREE.Mesh(new THREE.RingGeometry(9,12,24),new THREE.MeshBasicMaterial({color:'#ffcf73',side:THREE.DoubleSide,depthTest:false}));m.rotation.x=-Math.PI/2;m.position.copy(v3(...p,4));route.add(m);}

const dimensions=new THREE.Group();scene.add(dimensions);dimensions.visible=false;
const dimensionVertices=[];
function dimLine(a,b){dimensionVertices.push(...v3(...a,6).toArray(),...v3(...b,6).toArray());}
const half=layout.width/2;
dimLine(layout.city(-half,-125),layout.city(half,-125));
for(const a of [-half,half])dimLine(layout.city(a,-145),layout.city(a,-105));
dimLine(layout.city(half+100,0),layout.city(half+100,layout.length));
for(const b of [0,layout.length])dimLine(layout.city(half+80,b),layout.city(half+120,b));
const dimGeo=new THREE.BufferGeometry();dimGeo.setAttribute('position',new THREE.Float32BufferAttribute(dimensionVertices,3));dimensions.add(new THREE.LineSegments(dimGeo,new THREE.LineBasicMaterial({color:'#334f44',depthTest:false})));

const labelRecords=[];
const leaderSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderSvg.setAttribute('aria-hidden','true');leaderSvg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';$('labels').append(leaderSvg);
function addLabel(text,p,site=null,region=false,dimension=false){
  const el=document.createElement('button');el.className=`place-label ${region?'region':''} ${site?'landmark':''}`;el.innerHTML=site?`<span class="dot"></span>${text}`:text;
  el.setAttribute('aria-label',site?`查看${siteData[site].name}`:`查看${text}`);$('labels').append(el);
  const target=v3(...p,site?siteData[site].radius*.15+12:12);el.addEventListener('click',()=>site?focusSite(site):setView(text==='港口街区'?'harbor':'overview'));
  const leader=document.createElementNS('http://www.w3.org/2000/svg','line');leader.setAttribute('stroke','#456054');leader.setAttribute('stroke-width','1');leader.setAttribute('opacity','.65');leaderSvg.append(leader);
  labelRecords.push({el,target,site,region,text,dimension,leader});
}
Object.entries(siteData).forEach(([id,s])=>addLabel(s.short,s.p,id));
addLabel('山坡城区',layout.city(0,900),null,true);addLabel('城外营地',camp);addLabel('港口街区',[-360,1400]);addLabel('伊兹密特湾',[450,1930],null,true);addLabel('主城门 · 主路穿墙',southGate);addLabel('浴场偏门',postern);addLabel('北侧城门',northGate);
addLabel('东西 1,630 m',layout.city(0,-150),null,true,true);addLabel('南北 1,630 m',layout.city(half+140,layout.length/2),null,true,true);
let selected=null,flight=null,currentView='overview';
const defaultText={title:'从海湾进入山城',text:'海港在南，城区沿山坡向北展开。城墙下方是营地；清真寺、浴场和驻军堡垒集中在南缘。',meta:'1,630 × 1,630 m · 约2.66 km² · 地标按现代坐标'};
function clearSelection(){selected=null;document.querySelectorAll('[data-site]').forEach(b=>b.classList.remove('active'));labelRecords.forEach(l=>l.el.classList.remove('selected'));$('close-detail').hidden=true;}
function fly(target,offset){flight={from:camera.position.clone(),to:target.clone().add(offset),fromTarget:controls.target.clone(),toTarget:target.clone(),start:performance.now()};}
function setView(name){
  currentView=name;dimensions.visible=name==='plan';clearSelection();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  $('detail-kicker').textContent=name==='plan'?'高程 / 地面比例 1∶1':'地形与聚落';$('detail-title').textContent=defaultText.title;$('detail-text').textContent=defaultText.text;$('detail-meta').textContent=defaultText.meta;
  const fit=Math.max(1,1.25/camera.aspect);
  const cityCenter=layout.city(0,layout.length/2),southFocus=[(mosqueCenter[0]+bathCenter[0]+fortCenter[0])/3,(mosqueCenter[1]+bathCenter[1]+fortCenter[1])/3];
  const views={overview:{t:v3(...cityCenter,20),o:new THREE.Vector3(650,2100,2900).multiplyScalar(fit)},south:{t:v3(...southFocus,18),o:new THREE.Vector3(120,560,690).multiplyScalar(Math.max(1,.9/camera.aspect))},harbor:{t:v3(...layout.city(0,180),35),o:new THREE.Vector3(60,280,1520)},plan:{t:v3(...cityCenter,20),o:new THREE.Vector3(0,3100*fit,.1)}};
  const v=views[name];fly(v.t,v.o);
  if(name==='south'){$('detail-title').textContent='南城门与三处地标';$('detail-text').textContent='主路穿过南墙近中点的主城门。清真寺在主门西北侧；浴场在清真寺东南侧；堡垒位于主门西侧的城墙内，南侧堡墙与南城墙相连。';}
  if(name==='plan'){$('detail-title').textContent='1.63 km × 1.63 km，同一比例';$('detail-text').textContent='城墙按新图改为近正方形。主门设于橙色主路穿墙处，距南边中点约38米。两座公共建筑保持现代坐标，堡垒按小说布置并接墙。';}
  if(name==='harbor'){$('detail-title').textContent='港口—营地—城门';$('detail-text').textContent='上岸后先走过港口街区和山脚营地，再沿坡路抵达南侧主门。堡垒在主城门西侧城内，清真寺的宣礼塔可从海湾方向辨认。';}
}
function focusSite(id){
  clearSelection();dimensions.visible=false;selected=id;const d=siteData[id];$('detail-kicker').textContent=d.kicker;$('detail-title').textContent=d.name;$('detail-text').textContent=d.text;$('detail-meta').textContent=d.meta;$('close-detail').hidden=false;
  document.querySelector(`[data-site="${id}"]`).classList.add('active');labelRecords.find(l=>l.site===id).el.classList.add('selected');document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed','false'));
  const r=d.radius;fly(v3(...d.p,8),new THREE.Vector3(r*.9,r*.9,r*1.7));
  // Tight shadows around the inspected building make doors, roofs and courtyards legible.
  sun.target.position.copy(v3(...d.p));scene.add(sun.target);sun.position.copy(v3(...d.p)).add(new THREE.Vector3(-700,1000,650));const c=sun.shadow.camera;c.left=c.bottom=-240;c.right=c.top=240;c.updateProjectionMatrix();
}
function wideShadows(){sun.target.position.set(0,0,0);sun.position.set(-1700,1600,1500);const c=sun.shadow.camera;c.left=-2300;c.right=2300;c.top=2400;c.bottom=-2300;c.updateProjectionMatrix();}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{wideShadows();setView(b.dataset.view);}));
document.querySelectorAll('[data-site]').forEach(b=>b.addEventListener('click',()=>focusSite(b.dataset.site)));
$('close-detail').addEventListener('click',()=>{wideShadows();setView('south');});
$('labels-toggle').addEventListener('change',e=>$('labels').hidden=!e.target.checked);
$('contours-toggle').addEventListener('change',e=>contours.visible=e.target.checked);
$('route-toggle').addEventListener('change',e=>{route.visible=e.target.checked;roadHighlight.value=e.target.checked?1:0;});
$('sources-button').addEventListener('click',()=>$('sources').showModal());$('sources-close').addEventListener('click',()=>$('sources').close());
$('sources').addEventListener('click',e=>{if(e.target===$('sources')){const r=$('sources').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('sources').close();}});
controls.addEventListener('start',()=>flight=null);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(down[0]-e.clientX,down[1]-e.clientY)>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(pickable,true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.site)o=o.parent;if(o)focusSite(o.userData.site);}
});
const resize=()=>{const r=$('app').getBoundingClientRect();camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height);};new ResizeObserver(resize).observe($('app'));resize();
setView('overview');camera.position.copy(flight.to);controls.target.copy(flight.toTarget);flight=null;
let frame=0;
function animate(now){
  requestAnimationFrame(animate);
  if(flight){const t=clamp((now-flight.start)/1100,0,1),s=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,s);controls.target.lerpVectors(flight.fromTarget,flight.toTarget,s);if(t===1)flight=null;}
  controls.update();
  const ground=height(camera.position.x,camera.position.z);if(camera.position.y<ground+6)camera.position.y=ground+6;
  renderer.render(scene,camera);
  if(frame++%2===0){
    const r=$('app').getBoundingClientRect(),distance=camera.position.distanceTo(controls.target),occupied=[];
    const entries=[...labelRecords].sort((a,b)=>(selected?Number(b.site===selected)-Number(a.site===selected):0)||(Number(!!b.site)-Number(!!a.site)));
    for(const l of entries){
      const p=l.target.clone().project(camera);let x=(p.x*.5+.5)*r.width,y=(-p.y*.5+.5)*r.height-15;const anchorX=x,anchorY=y+15;
      if(currentView==='plan'&&!selected){
        if(l.site==='mosque'){x+=70;y-=25;}
        if(l.site==='fort'){x-=65;y-=20;}
        if(l.site==='bath'){x+=85;y+=8;}
      }
      const far=distance>2000,near=distance<600;
      let hide=p.z>1||p.z<0||x<20||x>r.width-20||y<100||y>r.height-60;
      if(l.dimension&&!dimensions.visible)hide=true;
      if(currentView==='plan'&&l.text==='浴场偏门')hide=true;
      if(l.site&&far&&l.site!=='mosque'&&currentView!=='plan')hide=true;
      if(!l.site&&['主城门 · 主路穿墙','浴场偏门','北侧城门'].includes(l.text)&&distance>1100&&currentView!=='plan')hide=true;
      if(near&&l.region)hide=true;
      if(selected&&l.site!==selected&&!['主城门 · 主路穿墙','浴场偏门','北侧城门'].includes(l.text))hide=true;
      const w=l.el.offsetWidth||110,h=26;
      if(!hide){for(let tries=0;tries<6;tries++){if(occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+7&&Math.abs(y-o.y)<32))y-=35;else break;}
        if(occupied.some(o=>Math.abs(x-o.x)<(w+o.w)/2+7&&Math.abs(y-o.y)<32))hide=true;else occupied.push({x,y,w});}
      l.el.hidden=hide;l.el.style.left=`${x}px`;l.el.style.top=`${y}px`;
      l.leader.setAttribute('x1',x);l.leader.setAttribute('x2',anchorX);l.leader.setAttribute('y1',y);l.leader.setAttribute('y2',anchorY);l.leader.style.display=hide||l.region?'none':'';
    }
    // North is -Z: viewed from the east (+azimuth), north points right.
    // SVG positive rotation is clockwise, so it shares the azimuth's sign.
    const a=controls.getAzimuthalAngle()*180/Math.PI;$('compass-needle').setAttribute('transform',`rotate(${a} 36 36)`);
  }
}
$('loading').hidden=true;
document.documentElement.dataset.sceneReady='true';
// Read-only diagnostics used by the browser check; no personal data or network telemetry.
const diagnostics={demVertices:pos.count,terrainMin:dem.heights.reduce((a,b)=>Math.min(a,b),Infinity),terrainMax:dem.heights.reduce((a,b)=>Math.max(a,b),-Infinity),houses:homePositions.length,sites:Object.fromEntries(Object.entries(siteData).map(([k,v])=>[k,{x:v.p[0],z:v.p[1],elevation:height(...v.p)}])),wallArea:Math.abs(boundary.reduce((a,p,i)=>{const q=boundary[(i+1)%boundary.length];return a+p[0]*q[1]-q[0]*p[1];},0))/2,renderer:'three.js r170',layout:{edgeLengths:boundary.map((p,i)=>Math.hypot(p[0]-boundary[(i+1)%4][0],p[1]-boundary[(i+1)%4][1])),southGate,fortCenter,boundary,mainRoad,gateOffsetFromMidpoint:layout.gateAcross,fortJoin:layout.fortJoin,landmarkGeo:{mosque:layout.toGeo(mosqueCenter),bath:layout.toGeo(bathCenter),fort:layout.toGeo(fortCenter)},mosqueEnvelope:[mw,md],bathEnvelope:[bw,bd]}};
$('scene').dataset.diagnostics=JSON.stringify(diagnostics);
requestAnimationFrame(animate);
