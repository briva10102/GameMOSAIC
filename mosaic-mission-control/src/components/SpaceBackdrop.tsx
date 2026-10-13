import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const fallback = '/assets/planet-fallback.svg';
export default function SpaceBackdrop({compact=false}:{compact?:boolean}) {
 const [image,setImage]=useState<string>(''); const [failed,setFailed]=useState(false);
 useEffect(()=>{let alive=true;const query=encodeURIComponent(import.meta.env.VITE_NASA_IMAGE_QUERY||'Jupiter planet');fetch(`https://images-api.nasa.gov/search?q=${query}&media_type=image&page_size=8`).then(r=>r.ok?r.json():Promise.reject()).then(data=>{if(!alive)return;const items=data?.collection?.items??[];const chosen=items.find((x:any)=>/jupiter|planet|earth|saturn/i.test(x?.data?.[0]?.title||''))??items[0];const href=chosen?.links?.find((l:any)=>l.rel==='preview')?.href;if(href)setImage(href);else setFailed(true);}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[]);
 return <div className={`space-backdrop ${compact?'space-backdrop--compact':''}`} aria-hidden="true">
  <div className="space-stars stars-a"/><div className="space-stars stars-b"/><div className="space-grid"/>
  {!failed&&image&&<img className="planet-photo" src={image} alt="" onError={()=>setFailed(true)}/>}
  {(failed||!image)&&<img className="planet-photo planet-fallback" src={fallback} alt="" onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none';}}/>}
  <motion.div className="planet-atmosphere" animate={{opacity:[.4,.65,.4]}} transition={{duration:9,repeat:Infinity,ease:'easeInOut'}}/>
  <div className="orbit orbit-one"/><div className="orbit orbit-two"/>
  <div className="space-vignette"/>
 </div>;
}
