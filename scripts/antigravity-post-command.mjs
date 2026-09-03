const raw = await new Promise(r => { let d=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", c=>d+=c); process.stdin.on("end", ()=>r(d)); });
console.log(JSON.stringify({}));
