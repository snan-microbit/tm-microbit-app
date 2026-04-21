
const { useState, useEffect, useRef, useCallback } = React;

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  refinado: {
    name:'Refinado', desc:'Pulido y claro',
    primary:'#009f95', primaryHover:'#008680', primaryLight:'#e8f5f4', primaryDeep:'#005f58',
    bg:'#f4f5f5', bgAlt:'#edf7f6', surface:'#fff', surfaceRaised:'#fafcfb',
    text:'#1a1a1a', textMid:'#454545', textLight:'#777',
    border:'#e0e0e0', borderAcc:'#c5e0de',
    hdr:'#009f95', hdrTxt:'#fff', hdrBorder:'transparent',
    r:12, rSm:8, rLg:16,
    sh:'0 1px 3px rgba(0,0,0,.07),0 2px 8px rgba(0,0,0,.05)',
    shMd:'0 2px 8px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.05)',
    shLg:'0 4px 20px rgba(0,0,0,.1)',
    dark:false,
  },
  expresivo: {
    name:'Expresivo', desc:'Colorido y llamativo',
    primary:'#009f95', primaryHover:'#008680', primaryLight:'#c8f0ec', primaryDeep:'#004a45',
    bg:'#f0faf9', bgAlt:'#e2f6f3', surface:'#fff', surfaceRaised:'#f8fdfc',
    text:'#0b1e1c', textMid:'#1d4845', textLight:'#4a7a76',
    border:'#b8e8e3', borderAcc:'#87d4cd',
    hdr:'#004a45', hdrTxt:'#fff', hdrBorder:'transparent',
    r:16, rSm:10, rLg:24,
    sh:'0 2px 0 rgba(0,74,69,.15),0 3px 10px rgba(0,0,0,.07)',
    shMd:'0 3px 0 rgba(0,74,69,.15),0 6px 20px rgba(0,0,0,.08)',
    shLg:'0 4px 0 rgba(0,74,69,.12),0 12px 32px rgba(0,0,0,.1)',
    dark:false,
  },
  minimo: {
    name:'Mínimo', desc:'Limpio y espacioso',
    primary:'#009f95', primaryHover:'#008680', primaryLight:'#f0faf9', primaryDeep:'#007a72',
    bg:'#fafafa', bgAlt:'#f3f3f3', surface:'#fff', surfaceRaised:'#fff',
    text:'#111', textMid:'#444', textLight:'#888',
    border:'#e8e8e8', borderAcc:'#d4e8e6',
    hdr:'#fff', hdrTxt:'#009f95', hdrBorder:'#e8e8e8',
    r:6, rSm:4, rLg:10,
    sh:'0 1px 2px rgba(0,0,0,.06)',
    shMd:'0 1px 4px rgba(0,0,0,.08)',
    shLg:'0 2px 12px rgba(0,0,0,.1)',
    dark:false,
  },
  oscuro: {
    name:'Oscuro', desc:'Modo oscuro profesional',
    primary:'#00c9bc', primaryHover:'#00b3a7', primaryLight:'rgba(0,201,188,.14)', primaryDeep:'#00e8d8',
    bg:'#0d1a19', bgAlt:'#112320', surface:'#182d2a', surfaceRaised:'#1e3532',
    text:'#dff0ee', textMid:'#a8cec9', textLight:'#6aa09b',
    border:'#263e3a', borderAcc:'#2e4e49',
    hdr:'#112320', hdrTxt:'#dff0ee', hdrBorder:'transparent',
    r:10, rSm:6, rLg:14,
    sh:'0 2px 8px rgba(0,0,0,.35)',
    shMd:'0 4px 16px rgba(0,0,0,.4)',
    shLg:'0 8px 32px rgba(0,0,0,.5)',
    dark:true,
  },
};

const CLS = [
  {c:'#1D9E75',bg:'#E1F5EE',dc:'#2dd49a',dbg:'rgba(45,212,154,.18)'},
  {c:'#378ADD',bg:'#E6F1FB',dc:'#5ba8f0',dbg:'rgba(91,168,240,.18)'},
  {c:'#D85A30',bg:'#FAECE7',dc:'#f07050',dbg:'rgba(240,112,80,.18)'},
  {c:'#7F77DD',bg:'#EEEDFE',dc:'#9a8ff0',dbg:'rgba(154,143,240,.18)'},
  {c:'#D4537E',bg:'#FBEAF0',dc:'#e87aab',dbg:'rgba(232,122,171,.18)'},
  {c:'#BA7517',bg:'#FAEEDA',dc:'#d4a040',dbg:'rgba(212,160,64,.18)'},
];
const clr = (i, dark) => { const x=CLS[i%CLS.length]; return { color: dark?x.dc:x.c, bg: dark?x.dbg:x.bg }; };

const TYPE_CFG = {
  image:{label:'Imagen', color:'#1D9E75', bg:'#E1F5EE', dc:'#2dd49a', dbg:'rgba(45,212,154,.18)'},
  audio:{label:'Audio',  color:'#378ADD', bg:'#E6F1FB', dc:'#5ba8f0', dbg:'rgba(91,168,240,.18)'},
  pose: {label:'Pose',   color:'#7F77DD', bg:'#EEEDFE', dc:'#9a8ff0', dbg:'rgba(154,143,240,.18)'},
};
const typeCfg = (type, dark) => { const x=TYPE_CFG[type]||TYPE_CFG.image; return { color: dark?x.dc:x.color, bg: dark?x.dbg:x.bg }; };

const MOCK = [
  {id:1, name:'Gestos de manos', type:'image', classes:['Pulgar arriba','Pulgar abajo','Palma abierta'], samples:[45,40,38], date:'hace 2 días', trained:true},
  {id:2, name:'Sonidos del aula', type:'audio', classes:['Silencio','Aplausos','Voz alta'], samples:[30,25,28], date:'hace 1 sem.', trained:true},
  {id:3, name:'Posturas deportivas', type:'pose', classes:['De pie','Saltando'], samples:[20,18], date:'hace 3 días', trained:false},
];

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Ic = {
  back:     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  bt:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"/></svg>,
  cam:      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  mic:      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  pose:     <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="4" r="2"/><path d="M12 6v6l-3 4m3-4l3 4M9 10H6m6 0h3"/></svg>,
  plus:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  dots:     <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>,
  trash:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>,
  reload:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>,
  code:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  chevR:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
};

// ─── TYPE ICONS ──────────────────────────────────────────────────────────────
function TypeIcon({type, size=32}) {
  const s = {width:size, height:size};
  if (type==='audio') return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
  if (type==='pose')  return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><path d="M12 8v5"/><path d="M9 11l-3 3M15 11l3 3"/><path d="M9 21l3-8 3 8"/></svg>;
  return <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
function HomeScreen({ t, projects, onOpen, onNewProject, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(null);
  const dark = t.dark;

  return (
    <div style={{minHeight:'100vh', background:t.bg, display:'flex', flexDirection:'column'}}>
      {/* App bar */}
      <header style={{background:t.hdr, borderBottom:`1px solid ${t.hdrBorder}`, boxShadow: t.hdrBorder!=='transparent'?t.sh:'none', padding:'0 1.5rem', height:64, display:'flex', alignItems:'center', gap:12, flexShrink:0}}>
        <img src="assets/icon-192.png" alt="" width="36" height="36" style={{borderRadius:8, flexShrink:0}} />
        <div>
          <div style={{fontWeight:800, fontSize:'1.05rem', color:t.hdrTxt, lineHeight:1.2}}>ML micro:bit</div>
          <div style={{fontSize:'0.72rem', color: dark ? t.textLight : (t.hdrBorder!=='transparent'?'rgba(255,255,255,.7)':t.textLight), lineHeight:1}}>Machine Learning + micro:bit</div>
        </div>
      </header>

      {/* Content */}
      <div style={{flex:1, maxWidth:1200, width:'100%', margin:'0 auto', padding:'2rem 1.5rem'}}>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:'1.5rem'}}>
          <div>
            <h2 style={{fontSize:'1.4rem', fontWeight:800, color:t.text}}>Mis Proyectos</h2>
            <p style={{fontSize:'0.85rem', color:t.textLight, marginTop:2}}>{projects.length} proyecto{projects.length!==1?'s':''} guardado{projects.length!==1?'s':''}</p>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'1rem'}}>
          {/* New project card */}
          <button onClick={onNewProject} style={{background:'none', border:`2px dashed ${t.primary}`, borderRadius:t.rLg, padding:'1.75rem 1rem', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.6rem', minHeight:180, transition:'all .15s', color:t.primary, fontFamily:'inherit'}}>
            <div style={{width:48, height:48, borderRadius:'50%', background:t.primaryLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.6rem', fontWeight:800}}>+</div>
            <div style={{fontWeight:700, fontSize:'0.9rem', color:t.primary}}>Nuevo Proyecto</div>
          </button>

          {/* Project cards */}
          {projects.map(p => {
            const tc = typeCfg(p.type, dark);
            return (
              <div key={p.id} style={{background:t.surface, borderRadius:t.rLg, border:`1px solid ${t.border}`, boxShadow:t.sh, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative'}}>
                {/* Card top accent */}
                <div style={{height:4, background:tc.color, opacity:.8}} />
                <div style={{padding:'1rem 1rem 0.75rem', flex:1, display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                  {/* Type badge + menu */}
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <span style={{fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.04em', background:tc.bg, color:tc.color, padding:'3px 8px', borderRadius:100, textTransform:'uppercase'}}>{TYPE_CFG[p.type]?.label}</span>
                    <div style={{position:'relative'}}>
                      <button onClick={e=>{e.stopPropagation();setMenuOpen(menuOpen===p.id?null:p.id);}} style={{background:'none',border:'none',cursor:'pointer',color:t.textLight,padding:'2px 4px',borderRadius:4,display:'flex',alignItems:'center'}}>
                        {Ic.dots}
                      </button>
                      {menuOpen===p.id && (
                        <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:t.surface,border:`1px solid ${t.border}`,borderRadius:t.rSm,boxShadow:t.shMd,zIndex:50,minWidth:160,overflow:'hidden'}}>
                          <button onClick={()=>{onDelete(p.id);setMenuOpen(null);}} style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'0.5rem 0.75rem',background:'none',border:'none',cursor:'pointer',color:'#e53935',fontSize:'0.85rem',fontFamily:'inherit',textAlign:'left'}}>
                            {Ic.trash} Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  <div style={{fontWeight:800, fontSize:'1rem', color:t.text, lineHeight:1.25}}>{p.name}</div>

                  {/* Classes preview */}
                  <div style={{display:'flex', flexWrap:'wrap', gap:4, marginTop:2}}>
                    {p.classes.slice(0,3).map((c,i) => (
                      <span key={i} style={{fontSize:'0.7rem', background:t.bgAlt, color:t.textMid, padding:'2px 6px', borderRadius:4, border:`1px solid ${t.border}`}}>{c}</span>
                    ))}
                    {p.classes.length>3 && <span style={{fontSize:'0.7rem', color:t.textLight}}>+{p.classes.length-3}</span>}
                  </div>

                  <div style={{fontSize:'0.72rem', color:t.textLight, marginTop:'auto', paddingTop:'0.5rem'}}>{p.date}</div>
                </div>

                {/* Card actions */}
                <div style={{padding:'0.6rem 1rem 1rem', display:'flex', gap:'0.5rem'}}>
                  {p.trained && (
                    <button onClick={()=>onOpen(p)} style={{flex:1, padding:'0.5rem', background:t.primary, color:'#fff', border:'none', borderRadius:t.rSm, fontSize:'0.85rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6}}>
                      Usar {Ic.chevR}
                    </button>
                  )}
                  {!p.trained && (
                    <button onClick={()=>onOpen(p,'train')} style={{flex:1, padding:'0.5rem', background:t.primaryLight, color:t.primary, border:`1.5px solid ${t.primary}`, borderRadius:t.rSm, fontSize:'0.85rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                      Continuar →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {projects.length===0 && (
          <div style={{textAlign:'center', padding:'4rem 1rem', color:t.textLight}}>
            <div style={{fontSize:3+'rem', marginBottom:'1rem', opacity:.3}}>📂</div>
            <div style={{fontWeight:700, fontSize:'1.1rem', marginBottom:'.5rem', color:t.textMid}}>Sin proyectos aún</div>
            <div style={{fontSize:'0.9rem'}}>Creá tu primer proyecto para empezar</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TYPE MODAL ───────────────────────────────────────────────────────────────
function TypeModal({ t, onSelect, onClose }) {
  const types = [
    {key:'image', title:'Modelo de Imagen', desc:'Reconocé objetos o gestos con la cámara'},
    {key:'audio', title:'Modelo de Audio',  desc:'Clasificá sonidos con el micrófono'},
    {key:'pose',  title:'Modelo de Pose',   desc:'Detectá posturas corporales en tiempo real'},
  ];
  const dark = t.dark;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:'1rem'}} onClick={onClose}>
      <div style={{background:t.surface,borderRadius:t.rLg,width:'100%',maxWidth:480,boxShadow:t.shLg,overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{background:t.hdr,padding:'1rem 1.25rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontWeight:800,fontSize:'1.05rem',color:t.hdrTxt}}>Nuevo Proyecto</div>
          <button onClick={onClose} style={{background:'rgba(255,255,255,.15)',border:'none',color:t.hdrTxt,width:32,height:32,borderRadius:'50%',cursor:'pointer',fontSize:'1.1rem',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'inherit'}}>×</button>
        </div>
        <div style={{padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
          <p style={{fontSize:'0.85rem', color:t.textLight, marginBottom:'0.25rem'}}>Elegí el tipo de entrada para tu modelo de Machine Learning</p>
          {types.map(tp => {
            const tc = typeCfg(tp.key, dark);
            return (
              <button key={tp.key} onClick={()=>onSelect(tp.key)} style={{display:'flex',alignItems:'center',gap:'1rem',padding:'1rem 1.25rem',border:`1.5px solid ${t.border}`,borderRadius:t.r,background:t.surface,cursor:'pointer',textAlign:'left',fontFamily:'inherit',transition:'all .15s'}}>
                <div style={{width:48,height:48,borderRadius:t.rSm,background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:tc.color}}>
                  <TypeIcon type={tp.key} size={24}/>
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.95rem',color:t.text}}>{tp.title}</div>
                  <div style={{fontSize:'0.8rem',color:t.textLight,marginTop:2}}>{tp.desc}</div>
                </div>
                <div style={{marginLeft:'auto', color:t.textLight, flexShrink:0}}>{Ic.chevR}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────
function PreviewModal({ t, project, onMoreSamples, onProgram }) {
  const dark = t.dark;
  const [preds, setPreds] = useState(project.classes.map((name,i)=>({name, conf: i===0?0.85:Math.random()*0.12})));

  useEffect(()=>{
    const iv = setInterval(()=>{
      setPreds(prev=>{
        const winner = Math.floor(Math.random()*prev.length);
        return prev.map((p,i)=>({...p, conf: i===winner ? 0.6+Math.random()*0.38 : Math.random()*0.18}));
      });
    }, 1600);
    return ()=>clearInterval(iv);
  },[]);

  const winner = preds.reduce((a,b)=>a.conf>b.conf?a:b, preds[0]);

  const WebcamPrev = () => (
    <div style={{width:'100%', aspectRatio:'1', background:dark?'#0a1918':'#111827', borderRadius:t.r, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.75rem', position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:`radial-gradient(circle at 50% 40%, ${dark?'rgba(0,201,188,.1)':'rgba(0,159,149,.07)'} 0%, transparent 65%)`}}/>
      <div style={{color:'rgba(255,255,255,.2)'}}><TypeIcon type={project.type} size={40}/></div>
      <div style={{fontSize:'0.75rem', color:'rgba(255,255,255,.3)', fontWeight:600}}>Vista en vivo</div>
      <div style={{position:'absolute',bottom:10,right:10,width:8,height:8,borderRadius:'50%',background:'#10b981'}}/>
    </div>
  );

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600,padding:'1rem'}}>
      <div style={{background:t.bg,borderRadius:t.rLg,width:'100%',maxWidth:860,maxHeight:'95vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:t.shLg}}>

        {/* Header */}
        <div style={{background:t.hdr,padding:'0 1.25rem',height:48,display:'flex',alignItems:'center',flexShrink:0}}>
          <span style={{fontWeight:800,fontSize:'1rem',color:t.hdrTxt}}>Probar modelo</span>
        </div>

        {/* Body */}
        <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

          {/* Webcam col */}
          <div style={{flex:1,padding:'1.25rem',display:'flex',flexDirection:'column',gap:'0.75rem',minWidth:0}}>
            <WebcamPrev/>
            {/* Winner highlight */}
            <div style={{background:t.primary,borderRadius:t.r,padding:'0.75rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
              <div>
                <div style={{fontSize:'0.7rem',fontWeight:600,color:'rgba(255,255,255,.7)',marginBottom:2}}>Detectando</div>
                <div style={{fontWeight:800,fontSize:'1.1rem',color:'#fff'}}>{winner?.name}</div>
              </div>
              <div style={{fontWeight:800,fontSize:'1.5rem',color:'#fff'}}>{Math.round((winner?.conf||0)*100)}%</div>
            </div>
          </div>

          {/* Predictions col */}
          <div style={{width:260,padding:'1rem 1rem 1rem 0',display:'flex',flexDirection:'column',gap:'0.5rem',overflow:'hidden'}}>
            <div style={{background:t.surface,borderRadius:t.r,border:`1px solid ${t.border}`,overflow:'hidden',flex:1,display:'flex',flexDirection:'column'}}>
              <div style={{padding:'8px 12px',borderBottom:`1px solid ${t.border}`,fontWeight:700,fontSize:'0.8rem',color:t.textMid,background:t.primary,color:'#fff',flexShrink:0}}>
                Clases detectadas
              </div>
              <div style={{padding:'8px',display:'flex',flexDirection:'column',gap:6,overflowY:'auto',flex:1}}>
                {preds.map((p,i)=>{
                  const cc = clr(i,dark);
                  const isWinner = p===winner;
                  return (
                    <div key={i} style={{padding:'8px 10px',borderRadius:t.rSm,background:isWinner?cc.bg:'transparent',border:`1px solid ${isWinner?cc.color:t.border}`,transition:'all .3s',borderLeft:`3px solid ${isWinner?cc.color:'transparent'}`}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:'0.82rem',fontWeight:isWinner?700:500,color:isWinner?cc.color:t.textMid}}>{p.name}</span>
                        <span style={{fontSize:'0.82rem',fontWeight:700,color:isWinner?cc.color:t.textLight}}>{Math.round(p.conf*100)}%</span>
                      </div>
                      <div style={{height:5,background:t.border,borderRadius:3,overflow:'hidden'}}>
                        <div style={{height:'100%',background:cc.color,width:`${p.conf*100}%`,borderRadius:3,transition:'width .5s ease-out'}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'0.875rem 1.25rem',borderTop:`1px solid ${t.border}`,display:'flex',gap:'0.75rem',background:t.surface,flexShrink:0}}>
          <button onClick={onMoreSamples} style={{flex:1,padding:'0.7rem',background:t.bgAlt,color:t.textMid,border:`1px solid ${t.border}`,borderRadius:t.r,fontSize:'0.9rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
            {Ic.reload} Tomar más muestras
          </button>
          <button onClick={onProgram} style={{flex:1,padding:'0.7rem',background:t.primary,color:'#fff',border:'none',borderRadius:t.r,fontSize:'0.9rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:7}}>
            {Ic.code} Programar micro:bit →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TRAINING SCREEN ─────────────────────────────────────────────────────────
function TrainingScreen({ t, project, onBack, onTrained }) {
  const [classes, setClasses] = useState(project.classes.map((name,i)=>({
    name,
    samples: project.samples[i]||0,
    thumbs: Array.from({length: project.samples[i]||0}, (_,j)=>({id:j, hue: (i*60 + j*7) % 360}))
  })));
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [activeClass, setActiveClass] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [capturing, setCapturing] = useState(false); // toggle capture state
  const capturingRef = useRef(false);
  const dark = t.dark;

  const capture = (idx) => setClasses(prev => prev.map((c,i)=> i!==idx ? c : {
    ...c,
    samples: c.samples+1,
    thumbs: [...c.thumbs, {id: Date.now()+Math.random(), hue: (idx*60 + c.thumbs.length*11) % 360}]
  }));

  const deleteThumb = (classIdx, thumbId) => setClasses(prev => prev.map((c,i)=> i!==classIdx ? c : {
    ...c,
    samples: Math.max(0, c.samples-1),
    thumbs: c.thumbs.filter(t=>t.id!==thumbId)
  }));

  // Toggle continuous capture (simulates hold-to-capture)
  const toggleCapture = (idx) => {
    if (capturingRef.current) {
      capturingRef.current = false;
      setCapturing(false);
      return;
    }
    capturingRef.current = true;
    setCapturing(true);
    const run = () => {
      if (!capturingRef.current) return;
      setClasses(prev => prev.map((c,i)=> i!==idx ? c : {
        ...c,
        samples: c.samples+1,
        thumbs: [...c.thumbs, {id: Date.now()+Math.random(), hue: (idx*60 + c.thumbs.length*11) % 360}]
      }));
      setTimeout(run, 250);
    };
    setTimeout(run, 250);
  };

  // Stop capture when active class changes
  useEffect(() => {
    capturingRef.current = false;
    setCapturing(false);
  }, [activeClass]);
  const addClass = () => setClasses(prev => [...prev, {name:`Clase ${prev.length+1}`, samples:0, thumbs:[]}]);
  const canTrain = classes.length>=2 && classes.every(c=>c.thumbs.length>=5);

  const trainModel = () => {
    setStep(1); setProgress(0);
    let p = 0;
    const iv = setInterval(()=>{ p+=Math.random()*8+4; if(p>=100){p=100;clearInterval(iv);setTimeout(()=>{setStep(2);setProgress(100);setShowPreview(true);},400);} setProgress(p); }, 120);
  };

  const steps = ['Capturar muestras','Entrenar modelo','Probar modelo'];

  const WebcamPlaceholder = () => {
    const icon = project.type==='audio' ? Ic.mic : project.type==='pose' ? Ic.pose : Ic.cam;
    return (
      <div style={{width:'100%', aspectRatio:'1', background: dark?'#0a1918':'#1a1a2e', borderRadius:t.r, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.75rem', position:'relative', overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0, background:`radial-gradient(circle at 50% 40%, ${dark?'rgba(0,201,188,.08)':'rgba(0,159,149,.06)'} 0%, transparent 65%)`}}/>
        <div style={{color: dark?t.primary:'rgba(255,255,255,.25)', position:'relative'}}>{icon}</div>
        <div style={{fontSize:'0.75rem', color:'rgba(255,255,255,.3)', fontWeight:600, position:'relative'}}>
          {project.type==='audio'?'Micrófono activo':'Cámara activa'}
        </div>
        <div style={{position:'absolute', bottom:10, right:10, width:8, height:8, borderRadius:'50%', background:'#e63946', animation:'blink 1s infinite'}}/>
      </div>
    );
  };

  return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', background:t.bg}}>
      {/* Header */}
      <header style={{background:t.hdr, padding:'0 1rem', height:52, display:'flex', alignItems:'center', gap:'0.75rem', flexShrink:0, borderBottom:`1px solid ${t.hdrBorder}`}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,.18)',border:'none',width:34,height:34,borderRadius:t.rSm,cursor:'pointer',color:t.hdrTxt,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{Ic.back}</button>
        <span style={{fontWeight:800, fontSize:'1rem', color:t.hdrTxt, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{project.name}</span>
        <span style={{fontSize:'0.7rem', fontWeight:700, background:'rgba(255,255,255,.18)', color:t.hdrTxt, padding:'3px 10px', borderRadius:100}}>{TYPE_CFG[project.type]?.label}</span>
      </header>

      {/* Step bar */}
      <div style={{background:t.surface, borderBottom:`1px solid ${t.border}`, padding:'0 1.5rem', display:'flex', alignItems:'center', gap:0, height:44, flexShrink:0, boxShadow:t.sh}}>
        {steps.map((s,i) => (
          <React.Fragment key={i}>
            <div style={{display:'flex', alignItems:'center', gap:6, padding:'0 0.5rem', height:'100%', borderBottom: step===i ? `2.5px solid ${t.primary}` : '2.5px solid transparent', marginBottom:-1}}>
              <div style={{width:20,height:20,borderRadius:'50%',background: step>i?t.primary:step===i?t.primary:t.border, display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'0.65rem',fontWeight:800,color:step>=i?'#fff':t.textLight,transition:'all .2s'}}>
                {step>i ? Ic.check : i+1}
              </div>
              <span style={{fontSize:'0.8rem', fontWeight: step===i?700:500, color: step===i?t.text:t.textLight, whiteSpace:'nowrap'}}>{s}</span>
            </div>
            {i<steps.length-1 && <div style={{flex:1, height:1, background:t.border, minWidth:8}}/>}
          </React.Fragment>
        ))}
      </div>

      {/* Body */}
      <div style={{flex:1, display:'flex', overflow:'hidden', minHeight:0}}>
        {/* Webcam col */}
        <div style={{flex:'0 0 auto', width:'min(45%, 400px)', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem', background:t.bgAlt, borderRight:`1px solid ${t.border}`}}>
          <WebcamPlaceholder/>
          <p style={{fontSize:'0.75rem', color:t.textLight, textAlign:'center', marginTop:'0.25rem'}}>
            Seleccioná una clase para capturar →
          </p>
        </div>

        {/* Classes col */}
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0}}>
          {/* Classes header */}
          <div style={{padding:'0.75rem 1rem', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:t.surface, flexShrink:0}}>
            <span style={{fontWeight:700, fontSize:'0.95rem', color:t.text}}>Clases de entrenamiento</span>
            <button onClick={addClass} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',background:'none',border:`1.5px dashed ${t.primary}`,borderRadius:t.rSm,color:t.primary,fontSize:'0.8rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              {Ic.plus} Nueva clase
            </button>
          </div>

          {/* Classes list */}
          <div style={{flex:1, overflowY:'auto', padding:'0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem'}}>
            {classes.map((c,i) => {
              const cc = clr(i, dark);
              const isActive = activeClass===i;
              return (
                <div key={i} onClick={()=>setActiveClass(i)} style={{background:t.surface, border:`1.5px solid ${isActive?cc.color:t.border}`, borderLeft:`4px solid ${cc.color}`, borderRadius:t.r, overflow:'hidden', cursor:'pointer', transition:'all .15s', boxShadow: isActive?t.shMd:'none'}}>
                  <div style={{padding:'0.625rem 0.875rem', display:'flex', alignItems:'center', gap:'0.5rem'}}>
                    <div style={{width:10, height:10, borderRadius:'50%', background:cc.color, flexShrink:0}}/>
                    <input defaultValue={c.name} style={{fontWeight:700, fontSize:'0.9rem', border:'none', background:'transparent', color:t.text, fontFamily:'inherit', flex:1, minWidth:0, outline:'none'}} onClick={e=>e.stopPropagation()}/>
                    <span style={{fontSize:'0.75rem', fontWeight:700, background:cc.bg, color:cc.color, padding:'2px 8px', borderRadius:100, flexShrink:0, whiteSpace:'nowrap'}}>{c.samples} muestras</span>
                  </div>
                  {/* Sample progress bar */}
                  <div style={{height:4, background:t.border}}>
                    <div style={{height:'100%', background:cc.color, width:`${Math.min(100, c.samples/30*100)}%`, transition:'width .3s', opacity:.7}}/>
                  </div>
                  {isActive && (
                    <div style={{padding:'0.5rem 0.875rem 0.625rem', background:cc.bg, display:'flex', flexDirection:'column', gap:'0.5rem'}}>
                      {/* Thumbnail gallery */}
                      {c.thumbs.length > 0 && (
                        <div style={{display:'flex', flexWrap:'wrap', gap:4, maxHeight:120, overflowY:'auto', paddingBottom:2}}>
                          {c.thumbs.map(th => (
                            <div key={th.id} style={{position:'relative', width:52, height:52, flexShrink:0}}>
                              <div style={{width:52, height:52, borderRadius:5, background:`hsl(${th.hue},45%,72%)`, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden'}}>
                                <div style={{width:'100%', height:'100%', background:`linear-gradient(135deg, hsl(${th.hue},45%,65%) 0%, hsl(${(th.hue+30)%360},40%,78%) 100%)`}}/>
                              </div>
                              <button onClick={e=>{e.stopPropagation();deleteThumb(i,th.id);}} style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:'50%',background:'#e63946',color:'#fff',border:'1.5px solid #fff',fontSize:9,fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',padding:0,lineHeight:1}}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Capture buttons */}
                      <div style={{display:'flex', gap:'0.5rem'}}>
                        <button onClick={e=>{e.stopPropagation();capture(i);}} style={{padding:'5px 12px', background:cc.color, color:'#fff', border:'none', borderRadius:t.rSm, fontSize:'0.78rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                          + 1 muestra
                        </button>
                        <button
                          onClick={e=>{e.stopPropagation();toggleCapture(i);}}
                          style={{padding:'5px 12px', background: capturing?'#e63946':cc.color, color:'#fff', border:'none', borderRadius:t.rSm, fontSize:'0.78rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit', animation: capturing?'blink .8s infinite':'none'}}>
                          {capturing ? '⏹ Detener' : '⏺ Captura continua'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Train button */}
          <div style={{padding:'0.75rem', borderTop:`1px solid ${t.border}`, background:t.surface, flexShrink:0}}>
            {step===2 ? (
              <button onClick={()=>setShowPreview(true)} style={{width:'100%', padding:'0.75rem', background:t.primary, color:'#fff', border:'none', borderRadius:t.r, fontSize:'1rem', fontWeight:800, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
                {Ic.check} Ver resultados →
              </button>
            ) : step===1 ? (
              <div style={{textAlign:'center'}}>
                <div style={{height:6, background:t.border, borderRadius:3, overflow:'hidden', marginBottom:'0.5rem'}}>
                  <div style={{height:'100%', background:t.primary, width:`${progress}%`, transition:'width .1s', borderRadius:3}}/>
                </div>
                <span style={{fontSize:'0.85rem', color:t.textMid, fontWeight:600}}>Entrenando modelo... {Math.round(progress)}%</span>
              </div>
            ) : (
              <button onClick={canTrain?trainModel:undefined} disabled={!canTrain} style={{width:'100%', padding:'0.75rem', background:canTrain?t.primary:t.border, color:canTrain?'#fff':t.textLight, border:'none', borderRadius:t.r, fontSize:'1rem', fontWeight:800, cursor:canTrain?'pointer':'not-allowed', fontFamily:'inherit', opacity:1}}>
                {canTrain ? '⚡ Entrenar modelo' : `Necesitás al menos 5 muestras por clase (${classes.filter(c=>c.thumbs.length>=5).length}/${classes.length} listas)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {showPreview && (
        <PreviewModal
          t={t}
          project={project}
          onMoreSamples={()=>{ setShowPreview(false); setStep(0); }}
          onProgram={()=>{ setShowPreview(false); onTrained(); }}
        />
      )}
    </div>
  );
}

// ─── PREDICTION SCREEN ────────────────────────────────────────────────────────
function PredictionScreen({ t, project, onBack, onRetrain }) {
  const [btStatus, setBtStatus] = useState('disconnected'); // disconnected | connecting | connected
  const [preds, setPreds] = useState(project.classes.map((_,i)=>({name:project.classes[i], conf: i===0?0.82:Math.random()*0.15})));
  const dark = t.dark;

  // Animate predictions
  useEffect(()=>{
    const iv = setInterval(()=>{
      setPreds(prev=>{
        const total = prev.length;
        const winner = Math.floor(Math.random()*total);
        return prev.map((p,i)=>({...p, conf: i===winner ? 0.6+Math.random()*0.38 : Math.random()*0.2}));
      });
    }, 1800);
    return ()=>clearInterval(iv);
  },[]);

  const connectBt = () => {
    if(btStatus==='connected'){setBtStatus('disconnected');return;}
    setBtStatus('connecting');
    setTimeout(()=>setBtStatus('connected'), 1800);
  };

  const btColors = {
    disconnected:{bg:dark?'rgba(230,57,70,.15)':'#fee2e2', color:'#e63946', dot:'#e63946', label:'Sin conexión'},
    connecting:  {bg:dark?'rgba(245,158,11,.15)':'#fef3c7', color:'#d97706', dot:'#f59e0b', label:'Conectando...'},
    connected:   {bg:dark?'rgba(0,159,149,.18)':'#d1fae5', color:'#059669', dot:'#10b981', label:'Conectado'},
  };
  const bt = btColors[btStatus];

  const winner = preds.reduce((a,b)=>a.conf>b.conf?a:b, preds[0]);

  const WebcamPlaceholder = () => (
    <div style={{width:'100%', aspectRatio:'1', background:dark?'#0a1918':'#111827', borderRadius:t.r, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.75rem', position:'relative', overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:`radial-gradient(circle at 50% 40%, ${dark?'rgba(0,201,188,.08)':'rgba(0,159,149,.06)'} 0%, transparent 65%)`}}/>
      <div style={{color:'rgba(255,255,255,.2)'}}><TypeIcon type={project.type} size={40}/></div>
      <div style={{fontSize:'0.75rem', color:'rgba(255,255,255,.3)', fontWeight:600}}>Vista en vivo</div>
      <div style={{position:'absolute', bottom:10, right:10, width:8, height:8, borderRadius:'50%', background:'#10b981'}}/>
    </div>
  );

  return (
    <div style={{height:'100vh', display:'flex', flexDirection:'column', background:t.bg}}>
      {/* Header */}
      <header style={{background:t.hdr, padding:'0 1rem', height:52, display:'flex', alignItems:'center', gap:'0.75rem', flexShrink:0}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,.18)',border:'none',width:34,height:34,borderRadius:t.rSm,cursor:'pointer',color:t.hdrTxt,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{Ic.back}</button>
        <span style={{fontWeight:800, fontSize:'1rem', color:t.hdrTxt, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{project.name}</span>

        {/* BT status badge in header */}
        <div style={{display:'flex',alignItems:'center',gap:6,background:bt.bg,padding:'4px 10px',borderRadius:100,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:bt.dot,animation:btStatus==='connected'?'blink 2s infinite':btStatus==='connecting'?'blink .6s infinite':'none'}}/>
          <span style={{fontSize:'0.72rem',fontWeight:700,color:bt.color,whiteSpace:'nowrap'}}>{bt.label}</span>
          {Ic.bt && <span style={{color:bt.color,display:'flex'}}>{Ic.bt}</span>}
        </div>
      </header>

      {/* Body */}
      <div style={{flex:1, display:'flex', overflow:'hidden', minHeight:0}}>

        {/* Left panel: video + predictions */}
        <div style={{width:320, flexShrink:0, display:'flex', flexDirection:'column', borderRight:`1px solid ${t.border}`, background:t.bgAlt, overflow:'hidden'}}>
          <div style={{flex:1, overflowY:'auto', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
            <WebcamPlaceholder/>

            {/* Winner highlight */}
            {winner && (
              <div style={{background:t.primary, borderRadius:t.r, padding:'0.75rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:'0.7rem', fontWeight:600, color:'rgba(255,255,255,.7)', marginBottom:2}}>Detectando</div>
                  <div style={{fontWeight:800, fontSize:'1.1rem', color:'#fff'}}>{winner.name}</div>
                </div>
                <div style={{fontWeight:800, fontSize:'1.5rem', color:'#fff'}}>{Math.round(winner.conf*100)}%</div>
              </div>
            )}

            {/* Prediction bars */}
            <div style={{background:t.surface, borderRadius:t.r, border:`1px solid ${t.border}`, overflow:'hidden'}}>
              <div style={{padding:'8px 12px', borderBottom:`1px solid ${t.border}`, fontWeight:700, fontSize:'0.8rem', color:t.textMid}}>Predicciones</div>
              <div style={{padding:'8px', display:'flex', flexDirection:'column', gap:6}}>
                {preds.map((p,i)=>{
                  const cc = clr(i, dark);
                  const isWinner = p===winner;
                  return (
                    <div key={i} style={{padding:'6px 8px', borderRadius:t.rSm, background: isWinner?cc.bg:'transparent', border:`1px solid ${isWinner?cc.color:t.border}`, transition:'all .3s'}}>
                      <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                        <span style={{fontSize:'0.82rem', fontWeight: isWinner?700:500, color: isWinner?cc.color:t.textMid}}>{p.name}</span>
                        <span style={{fontSize:'0.82rem', fontWeight:700, color: isWinner?cc.color:t.textLight}}>{Math.round(p.conf*100)}%</span>
                      </div>
                      <div style={{height:4, background:t.border, borderRadius:2, overflow:'hidden'}}>
                        <div style={{height:'100%', background:cc.color, width:`${p.conf*100}%`, borderRadius:2, transition:'width .5s ease-out'}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{padding:'0.75rem', borderTop:`1px solid ${t.border}`, background:t.surface, display:'flex', gap:'0.5rem', flexShrink:0}}>
            <button onClick={connectBt} style={{flex:1,padding:'0.6rem',background:btStatus==='connected'?'#fee2e2':t.primary,color:btStatus==='connected'?'#e63946':'#fff',border:btStatus==='connected'?'1.5px solid #e63946':'none',borderRadius:t.rSm,fontSize:'0.8rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              {Ic.bt} {btStatus==='connected'?'Desconectar':btStatus==='connecting'?'Conectando...':'Conectar micro:bit'}
            </button>
            <button onClick={onRetrain} style={{padding:'0.6rem 0.75rem',background:'transparent',color:t.primary,border:`1.5px solid ${t.primary}`,borderRadius:t.rSm,fontSize:'0.8rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>
              {Ic.reload} Reentrenar
            </button>
          </div>
        </div>

        {/* MakeCode panel — full height, no chrome */}
        <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, background: dark?'#0f1a19':'#f8f8f8'}}>
          <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative'}}>
            {/* MakeCode placeholder */}
            <div style={{textAlign:'center', color:t.textLight}}>
              <div style={{marginBottom:'0.75rem', opacity:.25, display:'flex', justifyContent:'center'}}>{Ic.code}</div>
              <div style={{fontWeight:700, fontSize:'0.95rem', color:t.textMid, marginBottom:'0.4rem'}}>Editor MakeCode Integrado</div>
              <div style={{fontSize:'0.82rem', maxWidth:300, lineHeight:1.5, color:t.textLight}}>Programá tu micro:bit con la extensión iaMachine para reaccionar a las clases detectadas</div>
              <button style={{marginTop:'1rem', padding:'0.6rem 1.25rem', background:t.primary, color:'#fff', border:'none', borderRadius:t.r, fontSize:'0.85rem', fontWeight:700, cursor:'pointer', fontFamily:'inherit'}}>
                Abrir MakeCode
              </button>
            </div>
            {/* Decorative block mockup */}
            <div style={{position:'absolute', bottom:20, left:20, right:20, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap', opacity:.18}}>
              {['al iniciar','cuando se detecta','mostrar LED','enviar mensaje'].map(b=>(
                <div key={b} style={{background:t.primary, color:'#fff', padding:'4px 10px', borderRadius:4, fontSize:'0.7rem', fontWeight:600}}>{b}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TWEAKS PANEL ─────────────────────────────────────────────────────────────
function TweaksPanel({ open, themeName, onTheme, onClose }) {
  if(!open) return null;
  return (
    <div style={{position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:900, background:'#fff', borderRadius:16, boxShadow:'0 8px 40px rgba(0,0,0,.18)', border:'1px solid #e0e0e0', width:260, overflow:'hidden'}}>
      <div style={{background:'#1a1a1a', padding:'0.75rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontWeight:700, fontSize:'0.9rem', color:'#fff'}}>Tweaks</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:'rgba(255,255,255,.6)',cursor:'pointer',fontSize:'1.1rem',fontFamily:'inherit'}}>×</button>
      </div>
      <div style={{padding:'1rem'}}>
        <div style={{fontSize:'0.75rem', fontWeight:700, color:'#888', marginBottom:'0.5rem', textTransform:'uppercase', letterSpacing:'0.06em'}}>Tema visual</div>
        <div style={{display:'flex', flexDirection:'column', gap:'0.4rem'}}>
          {Object.entries(THEMES).map(([key,th])=>(
            <button key={key} onClick={()=>onTheme(key)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.5rem 0.75rem',border:`1.5px solid ${themeName===key?th.primary:'#e0e0e0'}`,borderRadius:8,background:themeName===key?th.primaryLight:'#fff',cursor:'pointer',fontFamily:'inherit',transition:'all .15s'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:16,height:16,borderRadius:'50%',background:th.primary,flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:700,fontSize:'0.85rem',color:'#1a1a1a'}}>{th.name}</div>
                  <div style={{fontSize:'0.72rem',color:'#888'}}>{th.desc}</div>
                </div>
              </div>
              {themeName===key && <div style={{color:th.primary,display:'flex'}}>{Ic.check}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
function App() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('mlmb_redesign')||'{}'); } catch{return {};} })();
  const [screen, setScreen] = useState(saved.screen||'home');
  const [themeName, setThemeName] = useState(saved.theme||'refinado');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [currentProject, setCurrentProject] = useState(saved.project||null);
  const [projects, setProjects] = useState(MOCK);
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const t = THEMES[themeName];

  useEffect(()=>{
    localStorage.setItem('mlmb_redesign', JSON.stringify({screen, theme:themeName, project:currentProject}));
  },[screen, themeName, currentProject]);

  // Tweaks protocol
  useEffect(()=>{
    const handler = e => {
      if(e.data?.type==='__activate_edit_mode') setTweaksOpen(true);
      if(e.data?.type==='__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({type:'__edit_mode_available'},'*');
    return ()=>window.removeEventListener('message', handler);
  },[]);

  const handleTheme = (key) => {
    setThemeName(key);
    window.parent.postMessage({type:'__edit_mode_set_keys', edits:{theme:key}},'*');
  };

  const openProject = (p, mode) => { setCurrentProject(p); setScreen(mode==='train'?'training':'prediction'); };
  const newProjectType = (type) => {
    const np = {id:Date.now(), name:`Proyecto ${projects.length+1}`, type, classes:['Clase 1','Clase 2'], samples:[0,0], date:'ahora', trained:false};
    setProjects(prev=>[...prev, np]);
    setCurrentProject(np);
    setShowTypeModal(false);
    setScreen('training');
  };
  const deleteProject = (id) => setProjects(prev=>prev.filter(p=>p.id!==id));

  return (
    <div style={{fontFamily:"'Nunito', 'Segoe UI', sans-serif", WebkitFontSmoothing:'antialiased'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
        html,body,#root { height:100%; }
        button { touch-action: manipulation; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.35} }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,0,0,.15); border-radius:2px; }
        ::-webkit-scrollbar-track { background:transparent; }
      `}</style>

      {screen==='home' && (
        <HomeScreen t={t} projects={projects} onOpen={openProject} onNewProject={()=>setShowTypeModal(true)} onDelete={deleteProject}/>
      )}
      {screen==='training' && currentProject && (
        <TrainingScreen t={t} project={currentProject} onBack={()=>setScreen('home')} onTrained={()=>setScreen('prediction')}/>
      )}
      {screen==='prediction' && currentProject && (
        <PredictionScreen t={t} project={currentProject} onBack={()=>setScreen('home')} onRetrain={()=>setScreen('training')}/>
      )}

      {showTypeModal && <TypeModal t={t} onSelect={newProjectType} onClose={()=>setShowTypeModal(false)}/>}

      <TweaksPanel open={tweaksOpen} themeName={themeName} onTheme={handleTheme} onClose={()=>setTweaksOpen(false)}/>
    </div>
  );
}

Object.assign(window, { App });
