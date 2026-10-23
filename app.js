const { createApp } = Vue;

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

createApp({
  data() {
    return {
      rows: (window.SALES_DATA || []).map(row => ({ ...row, date: row.data_sdelki ? new Date(row.data_sdelki) : null })),
      page: 1,
      pageSize: 12,
      filters: { search: '', korpus: 'all', komnat: 'all', vid: 'all', maxDays: 0 },
      chartResizeObserver: null
    };
  },
  computed: {
    bounds() {
      const days = this.rows.map(r => Number(r.dney_v_rabote) || 0);
      return { maxDays: Math.max(1, d3.max(days) || 1) };
    },
    options() {
      return {
        korpus: [...new Set(this.rows.map(r => r.korpus).filter(Boolean))].sort(),
        komnat: [...new Set(this.rows.map(r => r.komnat).filter(v => v !== null && v !== undefined))].sort((a,b) => a-b),
        vid: [...new Set(this.rows.map(r => r.vid).filter(Boolean))].sort()
      };
    },
    filteredRows() {
      const f = this.filters;
      return this.rows.filter(r => {
        const matchesSearch = !f.search || String(r.kvartira).toLowerCase().includes(f.search.toLowerCase());
        const matchesDays = !this.isSold(r) || Number(r.dney_v_rabote) <= Number(f.maxDays);
        return matchesSearch && (f.korpus === 'all' || r.korpus === f.korpus) && (f.komnat === 'all' || String(r.komnat) === String(f.komnat)) && (f.vid === 'all' || r.vid === f.vid) && matchesDays;
      });
    },
    soldRows() { return this.filteredRows.filter(this.isSold); },
    unsoldRows() { return this.filteredRows.filter(r => !this.isSold(r)); },
    sellThrough() { return this.filteredRows.length ? this.soldRows.length / this.filteredRows.length : 0; },
    pagedRows() { const start = (this.page - 1) * this.pageSize; return this.filteredRows.slice(start, start + this.pageSize); },
    pageCount() { return Math.max(1, Math.ceil(this.filteredRows.length / this.pageSize)); },
    totalRevenue() { return d3.sum(this.soldRows, r => Number(r.summa_sdelki_rub) || 0); },
    avgDays() { return d3.mean(this.soldRows, r => Number(r.dney_v_rabote)) || 0; },
    avgDiscount() { return d3.mean(this.soldRows, r => this.discount(r)) || 0; }
  },
  watch: {
    filters: { deep: true, handler() { this.page = 1; this.$nextTick(this.renderCharts); } },
    filteredRows: { deep: true, handler() { this.$nextTick(this.renderCharts); } }
  },
  mounted() {
    this.filters.maxDays = this.bounds.maxDays;
    this.$nextTick(() => { this.renderCharts(); this.chartResizeObserver = new ResizeObserver(() => this.renderCharts()); this.chartResizeObserver.observe(document.querySelector('.constellation-panel')); });
  },
  beforeUnmount() { if (this.chartResizeObserver) this.chartResizeObserver.disconnect(); },
  methods: {
    formatMoney(value) { return `${money.format(Number(value) || 0)} ₽`; },
    formatNumber(value) { return number.format(Number(value) || 0); },
    formatPercent(value) { return `${number.format((Number(value) || 0) * 100)}%`; },
    formatDate(value) { return value ? new Date(value).toLocaleDateString('ru-RU') : '—'; },
    isSold(row) { return Boolean(row.data_sdelki && row.summa_sdelki_rub !== null && row.summa_sdelki_rub !== undefined); },
    discount(row) { const base = Number(row.stoimost_rub) || 0; return base ? (Number(row.skidka_rub) || 0) / base : 0; },
    discountTone(row) { const v = this.discount(row); return v < .03 ? 'discount-low' : v < .08 ? 'discount-mid' : 'discount-high'; },
    resetFilters() { this.filters = { search: '', korpus: 'all', komnat: 'all', vid: 'all', maxDays: this.bounds.maxDays }; },
    renderCharts() { this.renderConstellation(); },
    profile(row) {
      const area = +row.ploshchad_m2 < 70 ? 'до 70 м²' : +row.ploshchad_m2 < 100 ? '70–99 м²' : '100+ м²';
      const floor = +row.etazh <= 5 ? 'этаж 1–5' : +row.etazh <= 10 ? 'этаж 6–10' : 'этаж 11+';
      return `${row.komnat}-комн. · ${area} · ${floor}`;
    },
    renderConstellation() {
      const host = d3.select('#constellation-chart'); host.selectAll('*').remove();
      const rect = document.querySelector('#constellation-chart').getBoundingClientRect();
      const left = 235, right = 52, top = 16, rowHeight = 50;
      const grouped = d3.groups(this.filteredRows, r => this.profile(r)).map(([key, rows]) => {
        const sold = rows.filter(this.isSold); const rate = sold.length / rows.length;
        const medianDays = d3.median(sold, r => +r.dney_v_rabote) ?? 99;
        const avgDisc = d3.mean(sold, r => this.discount(r)) ?? .2;
        return { key, rows, sold, rate, medianDays, avgDisc, score: rate * 100 - medianDays * .8 - avgDisc * 80 };
      }).sort((a,b) => d3.descending(a.score,b.score));
      const width = Math.max(880, rect.width); const height = Math.max(300, grouped.length * rowHeight + top + 10); const laneWidth = (width-left-right)/4;
      const svg = host.append('svg').attr('width',width).attr('height',height);
      const lanes = svg.append('g').attr('transform',`translate(${left},0)`);
      lanes.selectAll('.lane-bg').data(d3.range(4)).join('rect').attr('class','lane-bg').attr('x',d=>d*laneWidth+2).attr('y',0).attr('width',laneWidth-4).attr('height',height).attr('fill',(d,i)=>i===3?'#f2f4f5':'#f7faf9');
      lanes.selectAll('.lane-separator').data(d3.range(1,4)).join('line').attr('class','lane-separator').attr('x1',d=>d*laneWidth).attr('x2',d=>d*laneWidth).attr('y1',0).attr('y2',height);
      const areaScale=d3.scaleSqrt().domain(d3.extent(this.rows,r=>+r.ploshchad_m2)).range([4,9]); const discountColor=d3.scaleSequential().domain([.12,0]).interpolator(d3.interpolateRgb('#e5715d','#30aa91'));
      const tooltip=d3.select('#tooltip');
      grouped.forEach((group,i)=>{
        const y=top+i*rowHeight+rowHeight/2;
        svg.append('text').attr('class','profile-label').attr('x',8).attr('y',y-4).text(group.key);
        svg.append('text').attr('class','profile-sub').attr('x',8).attr('y',y+11).text(`${group.sold.length}/${group.rows.length} продано · медиана ${group.sold.length?number.format(group.medianDays)+' дн.':'—'}`);
        svg.append('text').attr('class','score-label').attr('x',left-10).attr('y',y+4).attr('text-anchor','end').attr('fill',group.rate>=.75?'#25917f':group.rate>=.5?'#c57a35':'#c0574e').text(`${Math.round(group.rate*100)}%`);
        const buckets=[[],[],[],[]]; group.rows.forEach(r=>{const lane=!this.isSold(r)?3:+r.dney_v_rabote<=7?0:+r.dney_v_rabote<=14?1:2;buckets[lane].push(r)});
        buckets.forEach((rows,lane)=>rows.forEach((r,j)=>{const columns=Math.max(1,Math.floor((laneWidth-20)/18));const cx=left+lane*laneWidth+12+(j%columns)*18;const cy=y+(Math.floor(j/columns)-(Math.ceil(rows.length/columns)-1)/2)*17;const sold=this.isSold(r);svg.append('circle').datum(r).attr('class','deal-particle').attr('cx',cx).attr('cy',cy).attr('r',areaScale(+r.ploshchad_m2)).attr('fill',sold?discountColor(this.discount(r)):'#fff').attr('stroke',sold?'#fff':'#98a4aa').attr('stroke-width',sold?1.2:2).on('mousemove',(event,d)=>tooltip.style('display','block').style('left',`${event.clientX+14}px`).style('top',`${event.clientY-15}px`).html(`<b>${d.kvartira}</b> · ${sold?'Сделка':'Нет сделки'}<br>${d.komnat}-комн. · ${this.formatNumber(d.ploshchad_m2)} м² · этаж ${d.etazh}<br>${d.korpus} · ${d.vid}${sold?`<br>${d.dney_v_rabote} дн. · скидка ${this.formatPercent(this.discount(d))}`:''}`)).on('mouseleave',()=>tooltip.style('display','none'))}))
      });
    },
    renderScatter() {
      const host = d3.select('#scatter-chart'); host.selectAll('*').remove();
      const rect = document.querySelector('#scatter-chart').getBoundingClientRect(); const margin = { top: 18, right: 20, bottom: 43, left: 58 }; const width = Math.max(420, rect.width) - margin.left - margin.right; const height = Math.max(220, rect.height) - margin.top - margin.bottom;
      const svg = host.append('svg').attr('width', width + margin.left + margin.right).attr('height', height + margin.top + margin.bottom).append('g').attr('transform', `translate(${margin.left},${margin.top})`);
      const data = this.filteredRows; const x = d3.scaleLinear().domain([0, d3.max(this.rows, r => +r.dney_v_rabote || 0) || 1]).nice().range([0, width]); const y = d3.scaleLinear().domain([0, d3.max(this.rows, r => this.discount(r)) || .1]).nice().range([height, 0]); const size = d3.scaleSqrt().domain([0, d3.max(this.rows, r => +r.ploshchad_m2 || 0) || 1]).range([3, 15]); const color = d3.scaleOrdinal().domain(this.options.vid).range(['#36a99b','#ef9a62','#7186b4','#c579a7','#9aaa65']);
      svg.append('g').attr('class','grid').call(d3.axisLeft(y).tickSize(-width).tickFormat('')); svg.append('g').attr('class','axis').attr('transform',`translate(0,${height})`).call(d3.axisBottom(x).ticks(6)); svg.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(5).tickFormat(v => `${Math.round(v*100)}%`));
      svg.append('text').attr('x', width/2).attr('y', height+38).attr('fill','#84919a').attr('font-size',11).attr('text-anchor','middle').text('Дней в работе'); svg.append('text').attr('transform','rotate(-90)').attr('x',-height/2).attr('y',-43).attr('fill','#84919a').attr('font-size',11).attr('text-anchor','middle').text('Доля скидки');
      const tooltip = d3.select('#tooltip'); svg.selectAll('.dot').data(data, d => d.kvartira).join('circle').attr('class','dot').attr('cx',r=>x(+r.dney_v_rabote||0)).attr('cy',r=>y(this.discount(r))).attr('r',r=>size(+r.ploshchad_m2||0)).attr('fill',r=>color(r.vid)).attr('fill-opacity',.72).on('mousemove',(event,r)=>{tooltip.style('display','block').style('left',`${event.clientX+14}px`).style('top',`${event.clientY-15}px`).html(`<b>${r.kvartira}</b><br>${r.komnat}-комн. · ${this.formatNumber(r.ploshchad_m2)} м²<br>Сделка: ${this.formatMoney(r.summa_sdelki_rub)}<br>Срок: ${r.dney_v_rabote} дн. · скидка: ${this.formatPercent(this.discount(r))}`)}).on('mouseleave',()=>tooltip.style('display','none'));
    },
    renderRooms() {
      const host=d3.select('#rooms-chart');host.selectAll('*').remove();const rect=document.querySelector('#rooms-chart').getBoundingClientRect();const margin={top:20,right:20,bottom:36,left:40};const width=Math.max(280,rect.width)-margin.left-margin.right;const height=Math.max(220,rect.height)-margin.top-margin.bottom;const svg=host.append('svg').attr('width',width+margin.left+margin.right).attr('height',height+margin.top+margin.bottom).append('g').attr('transform',`translate(${margin.left},${margin.top})`);const counts=d3.rollups(this.filteredRows,v=>v.length,d=>d.komnat).sort((a,b)=>a[0]-b[0]);const x=d3.scaleBand().domain(counts.map(d=>d[0])).range([0,width]).padding(.3);const y=d3.scaleLinear().domain([0,d3.max(counts,d=>d[1])||1]).nice().range([height,0]);svg.append('g').attr('class','grid').call(d3.axisLeft(y).tickSize(-width).tickFormat(''));svg.append('g').attr('class','axis').attr('transform',`translate(0,${height})`).call(d3.axisBottom(x).tickFormat(v=>`${v} комн.`));svg.append('g').attr('class','axis').call(d3.axisLeft(y).ticks(5));svg.selectAll('.bar').data(counts).join('rect').attr('class','bar').attr('x',d=>x(d[0])).attr('y',d=>y(d[1])).attr('width',x.bandwidth()).attr('height',d=>height-y(d[1]));svg.selectAll('.bar-label').data(counts).join('text').attr('x',d=>x(d[0])+x.bandwidth()/2).attr('y',d=>y(d[1])-7).attr('text-anchor','middle').attr('fill','#52717c').attr('font-size',11).text(d=>d[1]);
    }
  }
}).mount('#app');
