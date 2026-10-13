import { useState } from 'react';
import { MessageCircle, Minus, Radio, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
export default function Rocky({status,fragments=0}:{status:string;fragments?:number}) {
 const [open,setOpen]=useState(true);
 const lines:Record<string,string>={READY:'Rocky online. Waiting for your signal, human.',STAGE_1_ACTIVE:'Human crew. Bring back the power cells. Carefully.',STAGE_2_ACTIVE:'Signal recovery is in your hands, human. Tell the console when the physical challenge is complete.',STAGE_2_COMPLETE:'Signal recovered. We are getting closer, human friend.',STAGE_3_ACTIVE:'Final system protocol. You can do this. Probably.',MISSION_COMPLETE:'Mission complete. Good teamwork, human friend.',PAUSED:'I am pausing my calculations. Let me know when we continue.',CANCELLED:'Mission cancelled. Rocky is standing by.'};
 return <div className={`rocky-widget ${open?'is-open':''}`}>
  <button className="rocky-head" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><span className="rocky-avatar"><span className="rocky-eye eye-one"/><span className="rocky-eye eye-two"/><span className="rocky-mouth"/></span><span className="rocky-title"><b>ROCKY</b><small><span className="live-dot"/> COMMS LINK ACTIVE</small></span><span className="rocky-toggle">{open?<Minus size={15}/>:<MessageCircle size={16}/>}</span></button>
  <AnimatePresence>{open&&<motion.div className="rocky-body" initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}}><div className="rocky-signal"><Radio size={13}/> EXTRATERRESTRIAL CHANNEL <Sparkles size={12}/></div><p>{lines[status]??'Rocky online. We solve problem together.'}</p></motion.div>}</AnimatePresence>
 </div>;
}
