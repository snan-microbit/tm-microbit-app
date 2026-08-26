# Respaldo manual — sustituto del export hasta que exista

Dos snippets de consola: uno vuelca todo a un archivo, el otro lo restaura. No reemplazan la feature de export, pero cierran el hueco mientras no exista.

**Qué guarda:** los registros de proyecto (`ml-microbit-models` y todas las claves `ml-*` de localStorage) y **todas las muestras** de la base `ml-microbit-app`.

**Qué NO guarda:** los pesos de los modelos entrenados, que viven en la base interna de TF.js. Es deliberado: los pesos se regeneran reentrenando, y con las muestras restauradas eso es un click. Guardarlos multiplicaría el tamaño del archivo por nada.

**Cómo usarlo:** con la app abierta en `https://ml-microbit.github.io`, F12 → Console → pegar y Enter.

---

## Respaldar

```js
(async () => {
  const DB = 'ml-microbit-app', STORE = 'samples';
  const b64 = (buf) => {
    const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const local = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('ml-')) local[k] = localStorage.getItem(k);
  }
  const samples = await new Promise((res) => {
    const req = indexedDB.open(DB);
    req.onerror = () => res({});
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) return res({});
      const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
      const ks = st.getAllKeys(), vs = st.getAll();
      tx.oncomplete = () => {
        const out = {};
        ks.result.forEach((k, i) => {
          const v = vs.result[i];
          out[k] = (v instanceof ArrayBuffer)
            ? { __arraybuffer__: b64(v) }
            : v;
        });
        res(out);
      };
      tx.onerror = () => res({});
    };
  });
  const dump = {
    formato: 'ml-microbit-respaldo-manual',
    version: 1,
    origen: location.origin,
    fecha: new Date().toISOString(),
    local,
    samples
  };
  const json = JSON.stringify(dump);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `ml-microbit-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  const proyectos = JSON.parse(local['ml-microbit-models'] || '[]');
  console.log(
    `Respaldo listo: ${proyectos.length} proyecto(s), ` +
    `${Object.keys(samples).length} juego(s) de muestras, ` +
    `${Math.round(json.length / 1024)} KB.`
  );
  console.log('Proyectos:', proyectos.map(p => `${p.name} (${p.projectType})`));
})();
```

Baja un `.json` a Descargas. Guardalo fuera de la máquina — en Drive, o que te lo manden.

## Restaurar

Pegá el snippet, elegí el archivo cuando se abra el selector.

```js
(() => {
  const DB = 'ml-microbit-app', STORE = 'samples';
  const unb64 = (s) => {
    const bin = atob(s), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b.buffer;
  };
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const dump = JSON.parse(await input.files[0].text());
    if (dump.formato !== 'ml-microbit-respaldo-manual') return console.error('No es un respaldo de esta app.');

    const actuales = JSON.parse(localStorage.getItem('ml-microbit-models') || '[]');
    if (actuales.length && !confirm(
      `Hay ${actuales.length} proyecto(s) en este navegador y se van a REEMPLAZAR ` +
      `por los ${JSON.parse(dump.local['ml-microbit-models'] || '[]').length} del respaldo.\n\n¿Seguir?`
    )) return console.log('Cancelado.');

    for (const [k, v] of Object.entries(dump.local)) localStorage.setItem(k, v);

    await new Promise((res, rej) => {
      const req = indexedDB.open(DB);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onerror = () => rej(req.error);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
        for (const [k, v] of Object.entries(dump.samples)) {
          st.put(v && v.__arraybuffer__ ? unb64(v.__arraybuffer__) : v, k);
        }
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });

    console.log('Restaurado. Recargá la página. Los modelos hay que reentrenarlos: las muestras están.');
  };
  input.click();
})();
```

---

## Notas

**El origen importa.** El respaldo anota de dónde salió. Restaurar en otro origen —otro dominio, otro puerto de Live Server— técnicamente funciona, pero es otro navegador desde el punto de vista del almacenamiento: los proyectos aparecen ahí y no en el original.

**Los modelos hay que reentrenarlos** después de restaurar. Es un click por proyecto y las muestras están intactas, que es lo que no se puede reconstruir.

**Cuándo conviene correrlo:** antes de cada clase con los proyectos ya armados, y después de cualquier clase donde se haya trabajado en serio. Dos minutos.

**Esto no es el export.** El export de verdad va a ser una feature con su formato versionado, pensada para mover proyectos entre máquinas y compartirlos. Esto es una red mientras tanto, y sirve además como evidencia: si a una docente se le rompe un proyecto, el archivo es lo único que va a permitir reconstruir qué pasó.
