// AGPL-3.0-only. Gravewright renderer for DSN's simulated transforms and shapes.
import * as T from 'three';
import {geometryData,orient,normal,faceLabels} from './geometry.js';
function texture(labels,prefs,percentile=false,sides=6) {
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const c=canvas.getContext('2d');c.fillStyle=prefs.diceColor;c.fillRect(0,0,256,256);
 c.fillStyle=prefs.textColor;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${sides>6?64:86}px "gw3d-${prefs.font}"`;
 const label=String(labels ?? '');const display=percentile?label.padStart(2,'0'):label;
 const width=c.measureText(display).width;if(width>172)c.font=`600 ${Math.floor(100*172/width)}px "gw3d-${prefs.font}"`;
 c.fillText(display,128,132);
 if(label==='6'||label==='9'){c.lineWidth=5;c.beginPath();c.moveTo(104,190);c.lineTo(152,190);c.strokeStyle=prefs.textColor;c.stroke();}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;
}
function dieMesh(die,landing,prefs) {
 const data=orient(geometryData(die.sides));
 const labels=faceLabels(data,landing,die.value,die.labels);
 const positions=[],uvs=[],geometry=new T.BufferGeometry(),materials=[];
 data.faces.forEach((face,index)=>{
  const vertices=face.map(i=>new T.Vector3(...data.vertices[i]));
  const n=new T.Vector3(...normal(data.vertices,face));
  const center=vertices.reduce((a,v)=>a.add(v),new T.Vector3()).divideScalar(vertices.length);
  const u=vertices[1].clone().sub(vertices[0]).normalize(),v=new T.Vector3().crossVectors(n,u).normalize();
  const projected=vertices.map(p=>{const d=p.clone().sub(center);return [d.dot(u),d.dot(v)];});
  const extent=Math.max(...projected.flat().map(Math.abs));
  const begin=positions.length/3;
  for(let j=1;j<face.length-1;j++)for(const i of [0,j,j+1]){positions.push(...vertices[i].toArray());uvs.push(.5+projected[i][0]/(extent*2.5),.5+projected[i][1]/(extent*2.5));}
  geometry.addGroup(begin,positions.length/3-begin,index);
  const map=texture(labels[index],prefs,die.percentile,die.sides);
  // Tetrahedron: each corner carries the value of its opposite face, matching
  // the upward vertex (the opposite face is the one resting on the desk).
  if(die.sides===4) {
   const c=map.image.getContext('2d');c.fillStyle=prefs.diceColor;c.fillRect(0,0,256,256);c.fillStyle=prefs.textColor;c.font=`600 44px "gw3d-${prefs.font}"`;
   face.forEach((vertex,i)=>{const opposite=data.faces.findIndex(f=>!f.includes(vertex));const [x,y]=projected[i];c.fillText(String(labels[opposite]),128+x/(extent*2.5)*256*.60,128-y/(extent*2.5)*256*.60);});map.needsUpdate=true;
  }
  const material=new T.MeshStandardMaterial({map,roughness:.42,metalness:.12,transparent:!!die.discarded,opacity:die.discarded?.48:1});
  materials.push(material);
 });
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
 const mesh=new T.Mesh(geometry,materials);mesh.castShadow=true;mesh.receiveShadow=true;
 const edges=new T.LineSegments(new T.EdgesGeometry(geometry,20),new T.LineBasicMaterial({color:prefs.textColor,transparent:true,opacity:.16}));mesh.add(edges);
 mesh.userData={value:die.value,landing,labels,sides:die.sides};return mesh;
}
export class DiceRenderer {
 constructor(container,{height=15}={}) {
  this.baseHeight=height;
  this.container=container;this.renderer=new T.WebGLRenderer({alpha:true,antialias:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0,0);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
  this.renderer.domElement.setAttribute('aria-hidden','true');container.append(this.renderer.domElement);
  this.scene=new T.Scene();this.camera=new T.OrthographicCamera(-12,12,8,-8,.1,100);this.camera.position.set(0,35,12);this.camera.lookAt(0,0,0);
  this.scene.add(new T.HemisphereLight(0xffffff,0x333844,3));
  const light=new T.DirectionalLight(0xffffff,4);light.position.set(-8,20,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-25,right:25,top:25,bottom:-25});light.shadow.bias=-.001;this.scene.add(light);
  this.floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.ShadowMaterial({opacity:.23}));this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.meshes=[];this.resize=new ResizeObserver(()=>this.size());this.resize.observe(container);this.size();
 }
 size(){const w=Math.max(this.container.clientWidth,1),h=Math.max(this.container.clientHeight,1);this.height=this.baseHeight;this.width=Math.max(10,this.height*w/h);this.camera.left=-this.width/2;this.camera.right=this.width/2;this.camera.top=this.height/2;this.camera.bottom=-this.height/2;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);this.renderer.render(this.scene,this.camera);}
 clear(){for(const m of this.meshes){this.scene.remove(m);m.traverse(o=>{o.geometry?.dispose();for(const mat of [].concat(o.material??[])){mat.map?.dispose();mat.dispose();}});}this.meshes=[];}
 set(dice,landing,prefs){this.clear();this.meshes=dice.map((d,i)=>dieMesh(d,landing[i],prefs));this.scene.add(...this.meshes);}
 frame(frame){for(let i=0;i<this.meshes.length;i++){const m=this.meshes[i],k=i*7;m.position.fromArray(frame,k);m.quaternion.fromArray(frame,k+3);}this.renderer.render(this.scene,this.camera);}
 dispose(){this.resize.disconnect();this.clear();this.floor.geometry.dispose();this.floor.material.dispose();this.scene.traverse(o=>o.shadow?.dispose());this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
