(function(){
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];

  /* PHOTOS 已替换为外部资源，见 src/data/photos.ts */
  function photoHTML(id, alt){
    return `<img src="${PHOTOS[id] || PHOTOS.tomatoEgg}" alt="${alt||'菜品胶片照片'}" decoding="async">`;
  }

  const DISHES = {
    tomatoEgg:{name:'番茄炒蛋', per100:{kcal:88,protein:5.6,fat:6.1,carb:2.8}, std:180, src:'近似条目：家常番茄炒蛋，按校园食堂常见配比估算'},
    rice:{name:'米饭', per100:{kcal:116,protein:2.6,fat:0.3,carb:25.9}, std:200, src:'参考：中国食物成分表（稻米·蒸）'},
    greens:{name:'清炒青菜', per100:{kcal:39,protein:1.5,fat:2.6,carb:3.2}, std:120, src:'近似条目：蒜蓉炒上海青'},
    pork:{name:'红烧肉', per100:null, std:90, src:'菜品库暂无该条目的每100克数据'},
  };

  const kcalOf = (id, grams) => {
    const d = DISHES[id];
    return d && d.per100 ? d.per100.kcal * grams / 100 : null;
  };
  const portionName = grams => grams>=200 ? '标准份' : grams>=150 ? '大半份' : grams>=100 ? '半份' : '小份';
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const KCAL_PER = {protein:4, fat:9, carb:4};

  function nutriOf(items){
    const g={protein:0,fat:0,carb:0}; let kcal=0, todo=0;
    items.forEach(it=>{
      const d = DISHES[it.id];
      if(!d || !d.per100){ todo++; return; }
      const r = it.grams / 100;
      g.protein += d.per100.protein*r; g.fat += d.per100.fat*r; g.carb += d.per100.carb*r;
      kcal += d.per100.kcal*r;
    });
    const ek = {protein:g.protein*KCAL_PER.protein, fat:g.fat*KCAL_PER.fat, carb:g.carb*KCAL_PER.carb};
    const eTot = ek.protein + ek.fat + ek.carb || 1;
    return {g, ek, kcal, todo, share:{protein:ek.protein/eTot, fat:ek.fat/eTot, carb:ek.carb/eTot}};
  }

  const draft = [
    {id:'tomatoEgg', grams:180},
    {id:'rice', grams:100},
  ];
  const todayMeals = [
    {meal:'午餐', time:'11:52', items:[{id:'tomatoEgg',grams:180},{id:'rice',grams:100},{id:'greens',grams:120},{id:'pork',grams:90}]},
    {meal:'早餐', time:'07:40', items:[{id:'rice',grams:200}]},
  ];
  function mealTotals(meal){
    let kcal=0, todo=0;
    meal.items.forEach(it=>{ const k=kcalOf(it.id,it.grams); if(k==null) todo++; else kcal+=k; });
    return {kcal, todo, count:meal.items.length};
  }

  function bindTilt(){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('.print--interactive, .res-print').forEach(card=>{
      if(card.dataset.tiltBound) return;
      card.dataset.tiltBound = '1';
      const baseRot = card.dataset.rot || '0';
      card.addEventListener('pointermove', e=>{
        if(e.pointerType === 'touch') return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (0.5 - py) * 5;
        const ry = (px - 0.5) * 6;
        card.classList.add('is-tilting');
        card.style.setProperty('--gx', (px*100).toFixed(1)+'%');
        card.style.setProperty('--gy', (py*100).toFixed(1)+'%');
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${baseRot}deg)`;
      });
      card.addEventListener('pointerleave', ()=>{
        card.classList.remove('is-tilting');
        card.style.transform = '';
      });
    });
  }

  function tickerTo(el, target, dur=620){
    if(!el) return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent = fmt(target); return; }
    const from = parseInt((el.dataset.cur || el.textContent || '0').replace(/[^\d]/g,''), 10) || 0;
    el.dataset.cur = target;
    const t0 = performance.now();
    (function step(t){
      const k = Math.min(1, (t - t0)/dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (target - from)*e);
      if(k < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  function renderToday(filled){
    const fan = $('#today-fan'), empty = $('#today-empty'), macro = $('#today-macro');
    if(filled && todayMeals.length){
      let sum=0, todoTotal=0;
      const n = nutriOf(todayMeals.flatMap(m=>m.items));
      todayMeals.forEach(m=>{ const t=mealTotals(m); sum+=t.kcal; todoTotal+=t.todo; });
      $('#today-kcal').innerHTML = '<span id="today-num">0</span><small>千卡</small>';
      tickerTo($('#today-num'), sum, 780);
      $('#today-sub').innerHTML = `已记 ${todayMeals.length} 餐` + (todoTotal ? ` · <span class="todo">${todoTotal} 道待估</span>` : '');
      const pm = Math.round(n.share.protein*100), fm = Math.round(n.share.fat*100), cm = Math.max(0, 100 - pm - fm);
      macro.innerHTML = `
        <div class="tm-bar" aria-label="今日三大营养供能占比">
          <i style="width:${pm}%;background:linear-gradient(180deg,#a8d48c,#7cb363)"></i>
          <i style="width:${fm}%;background:linear-gradient(180deg,#f5be6b,#e2943b)"></i>
          <i style="width:${cm}%;background:linear-gradient(180deg,#8ac8ba,#62a699)"></i>
        </div>
        <div class="tm-leg">
          <span><i style="background:#85bb6b"></i>蛋${pm}%</span>
          <span><i style="background:#e89d42"></i>脂${fm}%</span>
          <span><i style="background:#6cb1a4"></i>碳${cm}%</span>
        </div>`;
      fan.innerHTML = todayMeals.map((m, idx) => mealCard(m, idx)).join('');
      empty.hidden = true; fan.hidden = false;
      bindTilt();
    } else {
      $('#today-kcal').innerHTML = '<span id="today-num">0</span><small>千卡</small>';
      $('#today-sub').textContent = '今天还没有拍下的记录';
      macro.innerHTML = '';
      fan.innerHTML = ''; fan.hidden = true; empty.hidden = false;
    }
  }

  function mealCard(m, idx){
    const t = mealTotals(m);
    const rot = idx % 2 === 0 ? -0.9 : 0.85;
    return `<article class="print print--interactive" data-meal-idx="${idx}" data-rot="${rot}">
      <div class="print__glare" aria-hidden="true"></div>
      <div class="tape">${m.meal} ${m.time}</div>
      <div class="print__photo">
        ${photoHTML(m.items[0].id, DISHES[m.items[0].id]?.name)}
        <span class="print__open-cue">点开看详单</span>
        <span class="date-imprint">'26 11 23</span>
      </div>
      <div class="print__chin">
        <div class="dishlist">
          ${m.items.map(it=>{
            const d = DISHES[it.id] || {name:it.customName||'自填菜品', per100:null};
            const k = kcalOf(it.id, it.grams);
            return `<div class="dishrow ${k==null?'dishrow--todo':''}">
              <span class="dishrow__name">${d.name}</span>
              <span class="dishrow__kcal ${k==null?'todo-mark':''}">${k==null?'待定':fmt(k)+'<em>千卡</em>'}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="draft-sum">
          <div class="ds-l">${m.meal}合计${t.todo?'<b>含 '+t.todo+' 道待估算</b>':''}</div>
          <div class="ds-k">${fmt(t.kcal)}<em>千卡</em></div>
        </div>
      </div>
    </article>`;
  }

  function renderQuickSearch(){
    const grid = $('#qd-grid'); if(!grid) return;
    grid.innerHTML = Object.entries(DISHES).map(([id, d])=>{
      const k = d.per100 ? fmt(d.per100.kcal * d.std / 100) + '千卡' : '待估算';
      return `<button class="qd-item" data-add-dish="${id}">
        <img src="${PHOTOS[id]}" alt="${d.name}">
        <div><b>${d.name}</b><span>${d.std}g · ${k}</span></div>
      </button>`;
    }).join('');
  }

  function renderDraft(){
    const vf = $('#vf-img');
    if(vf && !vf.src) vf.src = PHOTOS.tomatoEgg;

    const strip = $('#draft-strip'), emptyNote = $('#contact-empty');
    strip.querySelectorAll('.contact__cell,.contact__ghost').forEach(n=>n.remove());
    if(emptyNote) emptyNote.style.display = draft.length ? 'none' : '';
    draft.forEach(d=>{
      const cell = document.createElement('div');
      const dish = DISHES[d.id];
      if(dish && dish.per100 && PHOTOS[d.id]){
        cell.className = 'contact__cell';
        cell.innerHTML = photoHTML(d.id, dish.name);
      } else {
        cell.className = 'contact__cell contact__cell--todo';
        cell.innerHTML = '<span>待估</span>';
      }
      strip.appendChild(cell);
    });
    if(draft.length && draft.length < 5){
      const g = document.createElement('div'); g.className = 'contact__ghost';
      strip.appendChild(g);
    }

    const list = $('#draft-list');
    list.innerHTML = draft.map(d=>{
      const dish = DISHES[d.id] || {name:d.customName||'自定义菜品', per100:null};
      const k = kcalOf(d.id, d.grams);
      return `<div class="dishrow ${k==null?'dishrow--todo':''}">
        <span class="dishrow__name">${dish.name}</span>
        <span class="dishrow__qty">${portionName(d.grams)} ${d.grams}g</span>
        <span class="dishrow__kcal ${k==null?'todo-mark':''}">${k==null?'待定':fmt(k)+'<em>千卡</em>'}</span>
      </div>`;
    }).join('') || '<div class="draft-empty">还没有菜。按快门拍一张，或点两侧快捷补录。</div>';

    const t = draft.reduce((a,d)=>{
      const k = kcalOf(d.id, d.grams);
      if(k == null) a.todo++; else a.kcal += k;
      return a;
    }, {kcal:0, todo:0});
    $('#draft-kcal').innerHTML = '<span id="draft-num">'+fmt(t.kcal)+'</span><em>千卡</em>';
    tickerTo($('#draft-num'), t.kcal, 500);
    $('#draft-count').textContent = draft.length + ' 道菜' + (t.todo ? `，含 ${t.todo} 道待估算` : '');
  }

  function makeAdvice(items){
    const n = nutriOf(items);
    const names = items.map(i => (DISHES[i.id]||{name:i.customName||'自填菜'}).name);
    const hasVeg = items.some(i => i.id === 'greens');
    const hasStaple = items.some(i => i.id === 'rice');
    const s = n.share;
    if(!hasVeg) return {head:'这餐还差一点绿。', body:`${names.join('、')}里没有绿叶菜，下次添一份清炒青菜，约 47 千卡，膳食纤维能补上一截。`};
    if(!hasStaple) return {head:'少了点主食。', body:`这一餐蔬菜有了，但缺主食，下午容易饿。加半碗米饭约 ${Math.round(DISHES.rice.per100.kcal)} 千卡即可。`};
    if(s.carb > 0.65) return {head:'碳水偏高了。', body:`碳水占了 ${Math.round(s.carb*100)}% 供能，下次把米饭减到半份、多夹一筷子青菜，配比会更稳。`};
    if(s.protein < 0.15) return {head:'蛋白质还能加一点。', body:`蛋白只占 ${Math.round(s.protein*100)}%，添个鸡蛋或一份豆腐，饱腹感会更久。`};
    if(s.fat > 0.50) return {head:'油脂偏多了。', body:`脂肪供能占了 ${Math.round(s.fat*100)}%，红烧肉这类可以换小份，清蒸或白灼更轻。`};
    return {head:'这一餐配得挺匀。', body:`蛋白、脂肪、碳水大致各就各位，保持这个节奏就好。`};
  }

  let resultItems = null;
  function renderResult(items, meta){
    if(items) resultItems = items;
    const entries = resultItems || [{id:'tomatoEgg',grams:180},{id:'rice',grams:100},{id:'pork',grams:90}];
    if(meta) $('#res-time').innerHTML = `<b>${meta.meal}</b>${meta.time} 记录`;
    const leadId = (entries[0] && PHOTOS[entries[0].id]) ? entries[0].id : 'tomatoEgg';
    const rph = $('#result-photo');
    rph.classList.remove('is-developing');
    rph.innerHTML = photoHTML(leadId, DISHES[leadId]?.name) + `<span class="date-imprint">'26 11 23</span>`;
    void rph.offsetWidth;
    rph.classList.add('is-developing');

    let sum=0, todo=0;
    $('#result-entries').innerHTML = entries.map(e=>{
      const d = DISHES[e.id] || {name:e.customName||'自定义菜品', per100:null, src:'用户手写补录'};
      if(!d.per100){
        todo++;
        return `<div class="entry">
          <button class="entry__btn" aria-expanded="false">
            <span class="entry__name">${d.name}</span><span class="entry__kcal todo">待估算</span><span class="entry__chev">▾</span>
          </button>
          <div class="entry__panel" hidden>
            <div class="grid"><dt>份量</dt><dd>${portionName(e.grams)} ${e.grams}g</dd><dt>每100克</dt><dd>暂无数据</dd><dt>出处</dt><dd>${d.src}</dd></div>
            <div class="note">标记为待估算：热量不计入已估算值，周统计会显示「数据不完整」。</div>
          </div></div>`;
      }
      const k = Math.round(d.per100.kcal * e.grams / 100); sum += k;
      return `<div class="entry">
        <button class="entry__btn" aria-expanded="false">
          <span class="entry__name">${d.name}</span><span class="entry__kcal">${k}<span style="font-size:11px;color:var(--ink3)"> 千卡</span></span><span class="entry__chev">▾</span>
        </button>
        <div class="entry__panel" hidden>
          <div class="grid">
            <dt>份量</dt><dd>${portionName(e.grams)} ${e.grams}g（实际吃下）</dd>
            <dt>每100克</dt><dd>${d.per100.kcal} 千卡</dd>
            <dt>蛋白质</dt><dd>${d.per100.protein} g</dd>
            <dt>脂肪</dt><dd>${d.per100.fat} g</dd>
            <dt>碳水</dt><dd>${d.per100.carb} g</dd>
            <dt>出处</dt><dd>${d.src}</dd>
          </div>
          <div class="nutri">
            <span>本份热量<b>${k} 千卡</b></span>
            <span>蛋白质<b>${(d.per100.protein*e.grams/100).toFixed(1)} g</b></span>
            <span>脂肪<b>${(d.per100.fat*e.grams/100).toFixed(1)} g</b></span>
          </div>
        </div></div>`;
    }).join('');
    $('#result-total').innerHTML = fmt(sum) + '<em>千卡</em>';
    $('#result-summary').innerHTML = `已估算热量<b>${entries.length} 道菜${todo ? '，含 ' + todo + ' 道待估算' : ''}</b>`;
    const adv = makeAdvice(entries);
    $('#result-advice').innerHTML = `<b>${adv.head}</b> ${adv.body}`;
    bindTilt();
  }

  const WEEK = [
    {d:'今天', date:'11/23 一', items:[{id:'tomatoEgg',grams:180},{id:'rice',grams:100},{id:'pork',grams:90}]},
    {d:'昨天', date:'11/22 日', items:[{id:'pork',grams:120},{id:'rice',grams:200}]},
    {d:'周六', date:'11/21 六', items:[{id:'rice',grams:200},{id:'tomatoEgg',grams:150}]},
    {d:'周五', date:'11/20 五', items:[]},
    {d:'周四', date:'11/19 四', items:[{id:'greens',grams:150},{id:'rice',grams:180}]},
    {d:'周三', date:'11/18 三', items:[]},
    {d:'周二', date:'11/17 二', items:[{id:'tomatoEgg',grams:180},{id:'pork',grams:100}]},
  ];
  let activeWeekIdx = 0;

  function renderWeekLoupe(idx){
    activeWeekIdx = idx;
    const day = WEEK[idx];
    const n = nutriOf(day.items);
    const box = $('#week-loupe');
    $$('.wcol').forEach((el, i) => el.classList.toggle('is-active', i === idx));
    if(!day.items.length){
      box.innerHTML = `<div class="wk-loupe__top"><b>${day.d}（${day.date}）</b><span>未记录</span></div>
        <div class="wk-loupe__dishes">这一天暂时留白，不计入本周日均。</div>`;
      return;
    }
    const pm = Math.round(n.share.protein*100), fm = Math.round(n.share.fat*100), cm = Math.max(0, 100 - pm - fm);
    const dishNames = day.items.map(it => `${DISHES[it.id].name} ${it.grams}g`).join('、');
    box.innerHTML = `<div class="wk-loupe__top"><b>${day.d}（${day.date}）</b><span>${fmt(n.kcal)} 千卡${n.todo?' · 含待估':''}</span></div>
      <div class="wk-loupe__dishes">${dishNames} — 蛋白 ${pm}% / 脂肪 ${fm}% / 碳水 ${cm}%</div>`;
  }

  function renderWeek(){
    let loggedDays=0, weekKcal=0, fullKcal=0, fullDays=0;
    const wsum = {protein:0, fat:0, carb:0};
    const rows = WEEK.map((day, i)=>{
      const n = nutriOf(day.items);
      const state = day.items.length === 0 ? 'empty' : (n.todo > 0 ? 'partial' : 'full');
      const isToday = i === 0;
      if(state !== 'empty'){ loggedDays++; weekKcal += n.kcal; wsum.protein += n.ek.protein; wsum.fat += n.ek.fat; wsum.carb += n.ek.carb; }
      if(state === 'full'){ fullKcal += n.kcal; fullDays++; }
      return {day, n, state, isToday, i};
    });
    const maxK = Math.max(1, ...rows.filter(r=>r.state!=='empty').map(r=>r.n.kcal));
    const yMax = Math.ceil(maxK * 1.25 / 500) * 500 || 500;
    const avg = fullDays ? Math.round(fullKcal / fullDays) : 0;
    const pct = k => Math.max(0, Math.min(100, k / yMax * 100));

    const cols = rows.map(r=>{
      let inner = '';
      if(r.state === 'empty'){
        inner = `<div class="wcol__ghost"></div>`;
      } else {
        const s = r.n.share;
        const segs = [['c', s.carb], ['f', s.fat], ['p', s.protein]];
        inner = `<div class="wbar" style="height:${pct(r.n.kcal)}%">${
          segs.filter(([,v])=>v>0.002).map(([k,v])=>`<i class="band band--${k}" style="height:${(v*100).toFixed(2)}%"></i>`).join('')
        }</div>`;
      }
      const valTxt = r.state === 'empty' ? '' :
        `<span class="wcol__val" style="bottom:calc(${pct(r.n.kcal).toFixed(2)}% + 4px)">${fmt(r.n.kcal)}${r.state==='partial'?'<span class="wcol__star">*</span>':''}</span>`;
      const no = r.day.date.split('/')[1].split(' ')[0];
      return `<button type="button" class="wcol wcol--${r.state}${r.isToday?' wcol--today':''}${r.i===activeWeekIdx?' is-active':''}" data-wk-idx="${r.i}" aria-label="${r.day.d} ${r.state==='empty'?'未记录':fmt(r.n.kcal)+'千卡'}">
        <div class="wcol__win"></div><span class="wcol__no">${no}<i class="fn-suffix">日</i></span>${valTxt}${inner}
      </button>`;
    }).join('');

    const yTicks = [yMax, Math.round(yMax/2), 0].map(v =>
      `<span class="wytick" style="bottom:${pct(v)}%">${v===0?'0':fmt(v)}</span>`
    ).join('');
    const avgLine = fullDays ? `<div class="wavg" style="bottom:${pct(avg)}%"></div>` : '';
    const avgTick = fullDays ? `<span class="wytick wytick--avg" style="bottom:${pct(avg)}%">均${fmt(avg)}</span>` : '';
    const grids = [0, 0.5, 1].map(f => `<div class="wgrid${f===0?' wgrid--base':''}" style="bottom:${f*100}%"></div>`).join('');
    const labels = rows.map(r => `<span class="wcol__lab${r.isToday?' wcol__lab--today':''}${r.state==='empty'?' wcol__lab--empty':''}">${r.isToday?'今':r.day.date.split(' ')[1]}</span>`).join('');

    $('#week-film').innerHTML = `
      <div class="wedge__plot">
        <div class="wedge__area">${grids}${avgLine}<div class="wcols">${cols}</div></div>
        <div class="wedge__yaxis">${yTicks}${avgTick}</div>
      </div>
      <div class="wedge__xlab">${labels}</div>`;

    $('#week-sum').innerHTML = `<b><span id="wk-num">${fmt(weekKcal)}</span> 千卡</b>已记录 ${loggedDays} 天`;
    tickerTo($('#wk-num'), weekKcal, 720);

    const wt = wsum.protein + wsum.fat + wsum.carb || 1;
    const sp = c => (c / wt * 100).toFixed(1);
    $('#week-comp').innerHTML = `
      <div class="wcomp__t"><b>本周营养构成</b><span>按供能占比</span></div>
      <div class="wcomp__bar">
        <i style="width:${sp(wsum.protein)}%;background:linear-gradient(180deg,#a8d48c,#7cb363)"></i>
        <i style="width:${sp(wsum.fat)}%;background:linear-gradient(180deg,#f5be6b,#e2943b)"></i>
        <i style="width:${sp(wsum.carb)}%;background:linear-gradient(180deg,#8ac8ba,#62a699)"></i>
      </div>
      <div class="wcomp__keys">
        <div class="wcomp__k"><span class="dot" style="background:#85bb6b"></span>蛋白<b>${sp(wsum.protein)}%</b></div>
        <div class="wcomp__k"><span class="dot" style="background:#e89d42"></span>脂肪<b>${sp(wsum.fat)}%</b></div>
        <div class="wcomp__k"><span class="dot" style="background:#6cb1a4"></span>碳水<b>${sp(wsum.carb)}%</b></div>
      </div>`;
    $('#week-note').innerHTML = `轻点任意一天可查看当日菜品；<b>*</b> 表示含待估算，虚线为完整日均值（${fmt(avg)} 千卡）。`;
    renderWeekLoupe(activeWeekIdx);
  }

  /* ---------- 分享 Canvas：暖阳拍立得明信片（1080×1350） ---------- */
  const SH = {W:1080, H:1350};
  const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC",Georgia,serif';
  const MONO  = '"SFMono-Regular",ui-monospace,"Menlo","Consolas","Noto Sans Mono CJK SC",monospace';
  const _imgCache = {};

  function photoImage(id){
    return new Promise(res=>{
      const key = PHOTOS[id] ? id : 'tomatoEgg';
      if(_imgCache[key]){ res(_imgCache[key]); return; }
      const img = new Image();
      img.onload = ()=>{ _imgCache[key] = img; res(img); };
      img.onerror = ()=>res(null);
      img.src = PHOTOS[key];
    });
  }
  function drawImageCover(ctx, img, x, y, w, h){
    const ir = img.width / img.height, tr = w / h;
    let sx=0, sy=0, sw=img.width, sh=img.height;
    if(ir > tr){ sw = img.height * tr; sx = (img.width - sw) / 2; }
    else { sh = img.width / tr; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  function crayonRing(ctx, cx, cy, rx, ry){
    ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
    const passes=[{w:9,a:.28,dx:-2,dy:1,s:.05,span:1.02},{w:6,a:.52,dx:1,dy:-1,s:-.04,span:.98},{w:3.6,a:.72,dx:0,dy:0,s:.02,span:.92}];
    passes.forEach((p,pi)=>{
      const start=p.span*(0.06+pi*0.02), end=Math.PI*2*p.span+0.16, segs=28;
      ctx.beginPath();
      for(let j=0;j<=segs;j++){
        const t=start+(end-start)*(j/segs);
        const wob=1+0.04*Math.sin(t*3+p.s*20)+0.018*Math.sin(t*7);
        const x=cx+p.dx+Math.cos(t)*rx*wob, y=cy+p.dy+Math.sin(t)*ry*wob;
        if(j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle='rgba(214,92,58,'+p.a+')'; ctx.lineWidth=p.w; ctx.stroke();
    });
    ctx.restore();
  }
  function inkStamp(ctx, cx, cy, r){
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(-0.12);
    ctx.strokeStyle='rgba(214,92,58,.84)'; ctx.fillStyle='rgba(214,92,58,.84)';
    ctx.lineWidth=3.6; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth=1.6; ctx.beginPath(); ctx.arc(0,0,r-7,0,Math.PI*2); ctx.stroke();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='700 '+Math.round(r*0.8)+'px '+SERIF;
    ctx.fillText('已记', 0, 2);
    ctx.restore();
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function drawStackBar(ctx,x,y,w,h,share,radius){
    const parts=[['p',share.protein,'#a8d48c','#7cb363'],['f',share.fat,'#f5be6b','#e2943b'],['c',share.carb,'#8ac8ba','#62a699']];
    ctx.save(); roundRect(ctx,x,y,w,h,radius); ctx.clip();
    let bx=x;
    for(const [,v,l1,l2] of parts){
      if(v<=0.002) continue;
      const bw=w*v;
      const gr=ctx.createLinearGradient(0,y,0,y+h); gr.addColorStop(0,l1); gr.addColorStop(1,l2);
      ctx.fillStyle=gr; ctx.fillRect(bx,y,bw,h);
      bx+=bw;
    }
    ctx.restore();
  }

  function shareModel(scope){
    if(scope==='meal'){
      const m=todayMeals[0], n=nutriOf(m.items);
      return {
        kicker:'这一餐', stamp:'LUNCH 11:52', photo:m.items[0].id,
        items:m.items.map(it=>({name:DISHES[it.id].name, k:kcalOf(it.id,it.grams)})),
        kcal:Math.round(n.kcal), todo:n.todo, share:n.share,
        caption:'好好吃饭，是今天最先做成的一件小事', bars:null
      };
    }
    if(scope==='day'){
      const items=todayMeals.flatMap(m=>m.items), n=nutriOf(items);
      return {
        kicker:'这一天', stamp:"'26 11 23 MON", photo:todayMeals[0].items[0].id,
        items:todayMeals.map(m=>({name:m.meal+' '+m.time, k:Math.round(mealTotals(m).kcal)})),
        kcal:Math.round(n.kcal), todo:n.todo, share:n.share,
        caption:'一整天的饭，都在这几张相纸里', bars:null
      };
    }
    const rows=WEEK.map(day=>({day, n:nutriOf(day.items)}));
    const total=rows.reduce((a,r)=>a+(r.day.items.length?r.n.kcal:0),0);
    const ws={protein:0,fat:0,carb:0}; rows.forEach(r=>{ws.protein+=r.n.ek.protein;ws.fat+=r.n.ek.fat;ws.carb+=r.n.ek.carb;});
    const wt=ws.protein+ws.fat+ws.carb||1;
    return {
      kicker:'这一周', stamp:"'26 11 W47", photo:null,
      kcal:Math.round(total), todo:rows.filter(r=>r.n.todo).reduce((a,r)=>a+r.n.todo,0),
      share:{protein:ws.protein/wt, fat:ws.fat/wt, carb:ws.carb/wt},
      logged:rows.filter(r=>r.day.items.length).length,
      bars:rows.map((r,i)=>({empty:!r.day.items.length, kcal:r.n.kcal, share:r.n.share, today:i===0, dayLbl:i===0?'今':r.day.date.split(' ')[1]})),
      caption:'一周的饭，拍下来才看得见'
    };
  }

  let curShare='meal';
  async function renderShare(scope){
    if(scope) curShare = scope;
    const m = shareModel(curShare);
    const cv = $('#share-canvas'); if(!cv) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,SH.W,SH.H);
    const W=SH.W, H=SH.H, P=58;

    // 暖阳奶油底 + 柔绿/蜜桃晨光晕
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#fcf7eb'); bg.addColorStop(1,'#f3ead6');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    let g=ctx.createRadialGradient(W*0.15,H*0.04,0,W*0.15,H*0.04,W*0.75);
    g.addColorStop(0,'rgba(218,238,200,.72)'); g.addColorStop(1,'rgba(218,238,200,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    g=ctx.createRadialGradient(W*0.88,H*0.08,0,W*0.88,H*0.08,W*0.65);
    g.addColorStop(0,'rgba(255,226,204,.62)'); g.addColorStop(1,'rgba(255,226,204,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // 顶栏
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#6ea462'; ctx.beginPath(); ctx.arc(P+8,72,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#385e33'; ctx.font='700 24px '+MONO;
    ctx.fillText('CALORIE SNAP', P+28, 72);
    ctx.textAlign='right'; ctx.fillStyle='#8d7b68'; ctx.font='600 22px '+MONO;
    ctx.fillText(m.stamp, W-P, 72);
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    ctx.fillStyle='#33261b'; ctx.font='800 54px '+SERIF;
    ctx.fillText(m.kicker, P, 158);

    // 珍珠白拍立得相纸本体
    const cardX=P, cardY=186, cardW=W-P*2, cardH=H-cardY-110;
    ctx.save(); ctx.shadowColor='rgba(104,84,54,.22)'; ctx.shadowBlur=48; ctx.shadowOffsetY=16;
    ctx.fillStyle='#fffdf8'; roundRect(ctx,cardX,cardY,cardW,cardH,10); ctx.fill(); ctx.restore();
    ctx.strokeStyle='rgba(212,196,166,.75)'; ctx.lineWidth=2;
    roundRect(ctx,cardX,cardY,cardW,cardH,10); ctx.stroke();

    // 顶部鼠尾草和纸胶带
    ctx.save(); ctx.translate(cardX+128, cardY-4); ctx.rotate(-0.04);
    ctx.fillStyle='rgba(204,228,188,.92)'; ctx.fillRect(-90,-18,180,36);
    ctx.restore();

    const inX=cardX+32, inW=cardW-64, cardBottom=cardY+cardH;
    let cursorY=cardY+30;

    if(m.photo){
      const phH = Math.round(inW * 0.68);
      const img = await photoImage(m.photo);
      ctx.save(); roundRect(ctx,inX,cursorY,inW,phH,6); ctx.clip();
      ctx.fillStyle='#ede3cf'; ctx.fillRect(inX,cursorY,inW,phH);
      if(img) drawImageCover(ctx, img, inX, cursorY, inW, phH);
      ctx.restore();
      ctx.textAlign='right'; ctx.textBaseline='alphabetic';
      ctx.fillStyle='#fff4d8'; ctx.font='600 24px '+MONO;
      ctx.fillText("'26 11 23", inX+inW-18, cursorY+phH-16);
      cursorY += phH;
    }

    if(m.bars){
      ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      ctx.fillStyle='#33261b'; ctx.font='800 58px '+SERIF;
      const kt=fmt(m.kcal); ctx.fillText(kt, inX+6, cursorY+54);
      const kw=ctx.measureText(kt).width;
      ctx.font='600 24px '+SERIF; ctx.fillStyle='#8d7b68';
      ctx.fillText('千卡，本周已记 '+m.logged+' 天', inX+kw+28, cursorY+54);
      crayonRing(ctx, inX+6+kw*0.5, cursorY+34, kw*0.5+14, 34);
      cursorY += 80;

      const barTopW=cardBottom-118, ch=Math.max(220, barTopW-cursorY-34);
      ctx.fillStyle='#faf5ea'; roundRect(ctx,inX,cursorY,inW,ch,10); ctx.fill();
      const plotX=inX+24, plotW=inW-48, plotH=ch-72, baseY=cursorY+ch-38;
      const maxK=Math.max(1,...m.bars.filter(b=>!b.empty).map(b=>b.kcal));
      const yMax=Math.ceil(maxK*1.15/50)*50;
      const slot=plotW/7, bw=slot*0.56;
      m.bars.forEach((b,i)=>{
        const cx=plotX+slot*i+(slot-bw)/2;
        if(b.empty){
          const gh=plotH*0.32;
          ctx.fillStyle='#ebe2cf'; roundRect(ctx,cx,baseY-gh,bw,gh,6); ctx.fill();
          ctx.fillStyle='#92806d'; ctx.font='600 16px '+SERIF; ctx.textAlign='center';
          ctx.fillText('未记',cx+bw/2,baseY-gh/2+6); ctx.textAlign='left';
        } else {
          const bh=b.kcal/yMax*plotH;
          const parts=[['c',b.share.carb,'#6cb1a4'],['f',b.share.fat,'#e89d42'],['p',b.share.protein,'#85bb6b']];
          let acc=0;
          for(const [,v,col] of parts){ if(v<=0.002) continue; const sh2=bh*v; ctx.fillStyle=col; ctx.fillRect(cx,baseY-acc-sh2,bw,sh2+0.6); acc+=sh2; }
          ctx.textAlign='center'; ctx.fillStyle=b.today?'#b44324':'#665545'; ctx.font='700 18px '+MONO;
          ctx.fillText(fmt(b.kcal), cx+bw/2, baseY-bh-10); ctx.textAlign='left';
        }
        ctx.textAlign='center'; ctx.fillStyle=b.today?'#b44324':'#8d7b68'; ctx.font='700 18px '+SERIF;
        ctx.fillText(b.dayLbl, cx+bw/2, baseY+26); ctx.textAlign='left';
      });
    }

    const barTop = cardBottom - 118, sigBase = cardBottom - 36;
    ctx.textAlign='left'; ctx.textBaseline='alphabetic';
    if(!m.bars){
      ctx.fillStyle='#33261b'; ctx.font='800 62px '+SERIF;
      const kt=fmt(m.kcal); ctx.fillText(kt, inX+6, cursorY+62);
      const kw=ctx.measureText(kt).width;
      ctx.font='600 25px '+SERIF; ctx.fillStyle='#8d7b68';
      ctx.fillText('千卡'+(m.todo?`（含 ${m.todo} 道待估）`:''), inX+kw+30, cursorY+62);
      crayonRing(ctx, inX+6+kw*0.5, cursorY+42, kw*0.5+14, 34);
      cursorY += 90;

      const rowsAvail = Math.floor((barTop - 22 - cursorY) / 40);
      m.items.slice(0, Math.max(1, Math.min(4, rowsAvail))).forEach(it=>{
        ctx.textAlign='left'; ctx.fillStyle='#33261b'; ctx.font='600 25px '+SERIF;
        ctx.fillText(it.name, inX, cursorY+26);
        ctx.textAlign='right'; ctx.fillStyle='#385e33';
        ctx.fillText(it.k!=null ? fmt(it.k)+' 千卡' : '待估算', inX+inW, cursorY+26);
        cursorY += 38;
      });
    }

    const pm=Math.round(m.share.protein*100), fm=Math.round(m.share.fat*100), cm=Math.max(0,100-pm-fm);
    ctx.font='600 21px '+MONO; ctx.fillStyle='#665545';
    ctx.textAlign='left'; ctx.fillText(`蛋白 ${pm}%`, inX, barTop-12);
    ctx.textAlign='center'; ctx.fillText(`脂肪 ${fm}%`, inX+inW/2, barTop-12);
    ctx.textAlign='right'; ctx.fillText(`碳水 ${cm}%`, inX+inW, barTop-12);
    drawStackBar(ctx, inX, barTop, inW, 20, m.share, 8);

    ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.fillStyle='#665545'; ctx.font='500 24px '+SERIF;
    ctx.fillText(m.caption, inX, sigBase);
    inkStamp(ctx, inX+inW-42, sigBase-22, 34);

    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillStyle='#8d7b68'; ctx.font='600 20px '+MONO;
    ctx.fillText('记录仅存于本机 · 卡路里拍立得', P, H-46);
    ctx.textAlign='right'; ctx.fillText(m.kicker+'明信片', W-P, H-46);

    const capR = $('#sh-cap-r'); if(capR) capR.textContent = curShare==='week' ? `${m.logged}/7 天` : 'PNG 样片';
    const sa = $('#sh-saved'); if(sa) sa.classList.remove('show');
  }

  function saveShare(){
    const cv = $('#share-canvas'); if(!cv) return;
    try{
      const url = cv.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = 'caloriesnap-' + Date.now() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      $('#sh-saved').classList.add('show');
    }catch(err){
      $('#sh-saved').innerHTML = '<b>浏览器拦下了自动下载。</b> 长按上面的预览图，选「存储图片」即可保存。';
      $('#sh-saved').classList.add('show');
    }
  }

  /* ---------- 路由 ---------- */
  const screens = {today:'#s-today', new:'#s-new', detect:'#s-detect', result:'#s-result', week:'#s-week', share:'#s-share'};
  function go(name){
    if(!screens[name]) return;
    Object.entries(screens).forEach(([k, sel])=>{
      const el = $(sel); if(!el) return;
      if(k === name){ el.hidden=false; el.classList.remove('screen-enter'); void el.offsetWidth; el.classList.add('screen-enter'); }
      else el.hidden = true;
    });
    $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.screen === name ? 'true' : 'false'));
    const sc = $('#scroller'); if(sc) sc.scrollTop = 0;
    const eb = {today:'今日食记', new:'拍下一餐', detect:'识别核对', result:'显影完成', week:'本周相册', share:'分享明信片'}[name];
    const ebn = $('#eyebrow'); if(ebn && eb) ebn.textContent = eb;
    if(name === 'share') renderShare();
    $('#main').focus({preventScroll:true});
  }

  /* ---------- 识别流 ---------- */
  const DETECT = [
    {id:'tomatoEgg', conf:0.94},
    {id:'rice', conf:0.88},
    {id:'pork', conf:0.71},
  ];
  let detPicked = new Set();

  function renderDetect(){
    $('#det-img').innerHTML = photoHTML('tomatoEgg', '待识别餐盘');
    $('#det-tag').textContent = '对焦识别中…';
    $('#det-scan').classList.add('on');
    $('#det-focus').classList.remove('locked');
    $('#det-count').textContent = '';
    $('#det-chips').innerHTML = '';
    detPicked = new Set(DETECT.map(d=>d.id));
    clearTimeout(renderDetect._t);
    renderDetect._t = setTimeout(()=>{
      $('#det-scan').classList.remove('on');
      $('#det-focus').classList.add('locked');
      $('#det-tag').textContent = `已锁定 ${DETECT.length} 道菜`;
      $('#det-count').textContent = '点贴纸可取消勾选';
      $('#det-chips').innerHTML = DETECT.map(d=>{
        const dish = DISHES[d.id], k = kcalOf(d.id, dish.std), todo = k == null;
        return `<button class="dl-chip" data-dish="${d.id}" aria-pressed="true">
          <span class="dl-chip__ic"><img src="${PHOTOS[d.id]}" alt="${dish.name}"></span>
          <span class="dl-chip__main">
            <span class="dl-chip__name">${dish.name}</span>
            <span class="dl-chip__sub">约 ${dish.std}g · 把握 ${Math.round(d.conf*100)}%</span>
          </span>
          <span class="dl-chip__kcal ${todo?'todo':''}">${todo?'待估':fmt(k)+'<span style="font-size:11px;color:#8d7b68">千卡</span>'}</span>
          <span class="dl-chip__box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
        </button>`;
      }).join('');
    }, 820);
  }

  function openDetect(){
    const sh = $('#shutter'); sh.classList.add('is-firing');
    setTimeout(()=>sh.classList.remove('is-firing'), 320);
    const flash = document.createElement('div'); flash.className = 'flash go';
    $('#cam-vf').appendChild(flash); setTimeout(()=>flash.remove(), 540);
    setTimeout(()=>{ go('detect'); renderDetect(); }, 300);
  }

  function confirmDetect(){
    const picked = DETECT.filter(d=>detPicked.has(d.id)).map(d=>({id:d.id, grams:DISHES[d.id].std}));
    const finalItems = picked.length ? picked : [{id:'tomatoEgg', grams:180}];
    finalItems.forEach(it=>{ if(!draft.some(d=>d.id===it.id)) draft.unshift({id:it.id, grams:it.grams}); });
    renderDraft();
    renderResult(finalItems, {meal:'本餐', time:'刚刚'});
    go('result');
  }

  document.addEventListener('click', e=>{
    const goBtn = e.target.closest('[data-go]');
    if(goBtn){ go(goBtn.dataset.go); return; }

    const mealCardEl = e.target.closest('[data-meal-idx]');
    if(mealCardEl){
      const m = todayMeals[Number(mealCardEl.dataset.mealIdx)];
      if(m){ renderResult(m.items, {meal:m.meal, time:m.time}); go('result'); }
      return;
    }

    if(e.target.closest('#shutter')){ openDetect(); return; }
    if(e.target.closest('#det-back')){ go('new'); return; }

    const chip = e.target.closest('.dl-chip');
    if(chip){
      const id = chip.dataset.dish;
      if(detPicked.has(id)){ detPicked.delete(id); chip.setAttribute('aria-pressed','false'); }
      else { detPicked.add(id); chip.setAttribute('aria-pressed','true'); }
      return;
    }
    if(e.target.closest('#det-confirm')){ confirmDetect(); return; }

    if(e.target.closest('#btn-search')){
      const ds = $('#drawer-search'), dm = $('#drawer-manual');
      const open = ds.hidden;
      ds.hidden = !open; dm.hidden = true;
      $('#btn-search').setAttribute('aria-expanded', String(open));
      $('#btn-manual').setAttribute('aria-expanded', 'false');
      return;
    }
    if(e.target.closest('#btn-manual')){
      const ds = $('#drawer-search'), dm = $('#drawer-manual');
      const open = dm.hidden;
      dm.hidden = !open; ds.hidden = true;
      $('#btn-manual').setAttribute('aria-expanded', String(open));
      $('#btn-search').setAttribute('aria-expanded', 'false');
      if(open) $('#manual-name').focus();
      return;
    }

    const addDish = e.target.closest('[data-add-dish]');
    if(addDish){
      const id = addDish.dataset.addDish, d = DISHES[id];
      draft.push({id, grams:d.std});
      renderDraft();
      $('#vf-img').src = PHOTOS[id];
      $('#shot-cap').innerHTML = `已加入 <b>${d.name}</b>（${d.std}g）`;
      return;
    }

    const wkBtn = e.target.closest('[data-wk-idx]');
    if(wkBtn){ renderWeekLoupe(Number(wkBtn.dataset.wkIdx)); return; }

    const scopeBtn = e.target.closest('#sh-seg button');
    if(scopeBtn){
      $$('#sh-seg button').forEach(b => b.setAttribute('aria-selected', String(b === scopeBtn)));
      renderShare(scopeBtn.dataset.scope);
      return;
    }
    if(e.target.closest('#sh-save')){ saveShare(); return; }

    const entryBtn = e.target.closest('.entry__btn');
    if(entryBtn){
      const panel = entryBtn.nextElementSibling;
      const open = entryBtn.getAttribute('aria-expanded') === 'true';
      entryBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if(panel) panel.hidden = open;
      return;
    }
  });

  $('#manual-form')?.addEventListener('submit', e=>{
    e.preventDefault();
    const name = ($('#manual-name').value || '').trim();
    const grams = Math.max(20, parseInt($('#manual-grams').value, 10) || 120);
    if(!name) return;
    draft.push({id:'custom_'+Date.now(), customName:name, grams});
    renderDraft();
    $('#manual-name').value = '';
    $('#shot-cap').innerHTML = `已手写 <b>${name}</b>（${grams}g，标为待估算）`;
  });

  document.addEventListener('keydown', e=>{
    if(e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT') return;
    const map = {'1':'today','2':'new','3':'result','4':'week','5':'share'};
    if(map[e.key]) go(map[e.key]);
  });

  renderQuickSearch();
  renderDraft();
  const showEmpty = new URLSearchParams(location.search).get('empty') === '1';
  renderToday(!showEmpty);
  renderResult();
  renderWeek();
  renderShare('meal');
})();
