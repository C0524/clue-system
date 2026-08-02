
window.app = new Vue({
  el:"#app",
  data:{
    isLogin:false,
    user:{},
    loginUser:"",
    loginPwd:"",
    loginError:"",
    isLoading:false,
    successMsg:"",
    errorMsg:"",
    tab:1,
    form:{taoRen:"",channel:"",name:"",gender:"",age:"",phone:"",wechat:"",doctor:"",department:"",content:""},
    list:[],bookList:[],showList:[],showBookList:[],
    userList:[],newUser:"",newPwd:"",newRole:"咨询",
    taoRenList:[],newTaoName:"",
    doctorList:[],newDoc:{name:"",dept:"",operator:""},editingDoctor:null,
    logs:[],
    logClueId:'',logStart:'',logEnd:'',
    logCurrentPage:1,logPageSize:50,logTotal:0,logTotalPage:1,
    search:{taoRen:"",bookUser:"",channel:"",name:"",phone:"",wechat:"",doctor:"",intent:"",book:"",arrive:"",startDate:"",endDate:"",visitStart:'',visitEnd:'',id:""},
    currentPage:1,pageSize:20,totalPage:1,totalCount:0,
    serverPaging:true,
    // server version for detecting backend restart
    serverVersion: null,
    _serverVersionTimer: null,
    unvisitedTotal: 0,
    unvisitedToday: 0,
    expiredCount: 0,
    // tooltip for expired reason
    tooltipVisible: false,
    tooltipText: '',
    tooltipX: 0,
    tooltipY: 0,
    bookCurrentPage:1,bookPageSize:20,bookTotalPage:1,
    revisitCurrentPage:1,revisitPageSize:20,revisitTotalPage:1,
    showDetail:false,
    showEditModal:false,
    editingId:null,
    editForm:{},
    currentDetail:{},currentVisit:[],visitContent:"",
    detailEditing: false,
    editDetail: {},
    doctorStat:[],taoStat:[],bookUserStat:[],personnelStat:[],monthGoalStat:[],monthGoalDayTotals:null,drugCostStat:[],
    medicineDayScheme: 'legacy',
    medicineDayTransition: '2026-06-01',
    // 临时统计开关：将未回访视为已回访并视为有效（仅管理员可见）
    statTreatUnvisitedAsRevisited: false,
    revisitList:[],
    revisitShowList:[],
    revisitSearch:{id:'',name:'',phone:'',wechat:'',doctor:'',arriveStart:'',arriveEnd:''},
    selectedMonth: (new Date()).toISOString().slice(0,7),
    // 复诊管理的月份过滤，'全部' 或 'YYYY-MM'
    revisitMonth: '全部',
    // appointment page month filter: '全部' or 'YYYY-MM'
    bookMonth: '全部',
    bookMonthYear: (new Date()).getFullYear(),
    exportStartDate:"",exportEndDate:"",exportVisitDate:"",exportDoctor:"",
    showImportModal:false,showExportModal:false,
    showImportConflictModal:false,
    importConflicts:[],
    selectedFileName:"",previewData:[],isImporting:false,isExporting:false,
    settingsOpen:false,
    showRowActionsFlag:false,selectedRow:null,showInlineDetail:false,inlineVisitContent:'',inlineLoading:false,
    // 安排复诊模态与表单数据
    revisitModalVisible: false,
    revisitForm: { baseItemId: '', doctor: '', bookUser: '', visitMode: '', visitDate: '', dosageForm: '', medicineDay: '' },
    // 复诊回访弹窗数据
    showRevisitVisitModal: false,
    selectedRevisitItem: null,
    revisitVisitList: [],
    revisitVisitContent: ''
    ,revisitVisitContext: '咨询'
    ,revisitDraftId: null
    ,highlightedId: null
    ,personnelTotals: null
    ,personnelChannelBreakdown: null
    ,showChannelPopup: false
    ,preCaseDraft: ''
    ,revisitUploading: false
    ,preCaseEditing: false
    ,channelPopupItems: []
    ,channelPopupX: 0
    ,channelPopupY: 0
    ,hideChannelTimer: null
    // 图片上传队列与已上传列表
    ,uploadQueue: []
    ,uploadedImages: []
    ,_clueImagesTimer: null
    // 附件查看模态数据
    ,selectedIds: []
    ,selectAllPage: false
    ,showAssignModal: false
    ,assignScope: 'page' // 'page' or 'filter'
    ,assignTarget: ''
    ,assignNote: ''
    ,consultList: []
    ,filteredCount: 0
    ,assignLoading: false
    ,detailErrors: {}
    
  },
  computed:{
    pageList(){
      if(this.serverPaging) return this.list || [];
      return this.showList.slice((this.currentPage-1)*this.pageSize,this.currentPage*this.pageSize);
    },
    bookMonthOptions(){
      const y = this.bookMonthYear || (new Date()).getFullYear();
      const opts = ['全部'];
      for(let m=1;m<=12;m++){
        const mm = (m<10?('0'+m):m);
        opts.push(`${y}-${mm}`);
      }
      return opts;
    },
    bookPageList(){return this.showBookList.slice((this.bookCurrentPage-1)*this.bookPageSize,this.bookCurrentPage* this.bookPageSize);},
    revisitPageList(){return this.revisitShowList.slice((this.revisitCurrentPage-1)*this.revisitPageSize,this.revisitCurrentPage*this.revisitPageSize);},
    userRole(){return this.user.role;},
    monthDays(){
      // try to infer number of days from returned monthGoalStat or selectedMonth
      if(this.monthGoalStat && this.monthGoalStat.length>0 && Array.isArray(this.monthGoalStat[0].dayCounts)){
        return this.monthGoalStat[0].dayCounts.map((_,i)=>i+1);
      }
      if(this.selectedMonth){
        const parts = (''+this.selectedMonth).split('-');
        if(parts.length===2){
          const y = parseInt(parts[0],10);
          const m = parseInt(parts[1],10) - 1; // monthIndex
          if(Number.isFinite(y) && Number.isFinite(m)){
            const days = new Date(y, m+1, 0).getDate();
            return Array.from({length:days}, (_,i)=>i+1);
          }
        }
      }
      return [];
    }
  },
  watch:{
    showList(v){ if(!this.serverPaging){ this.totalPage=Math.ceil(v.length/this.pageSize)||1; this.currentPage=1; } },
    showBookList(v){this.bookTotalPage=Math.ceil(v.length/this.bookPageSize)||1;this.bookCurrentPage=1},
    revisitShowList(v){this.revisitTotalPage=Math.ceil(v.length/this.revisitPageSize)||1;this.revisitCurrentPage=1},
    revisitMonth(v){ try{ this.revisitCurrentPage = 1; this.getRevisitList(); }catch(e){ console.error('revisitMonth watch error', e); } }
  },
  created(){
    // 不在 created 时自动恢复登录，要求每次打开页面重新登录
  },
  mounted(){
    // 初始化 select 的样式（当值为空时降低文字透明度）
    this.$nextTick(()=>{
      this.updateSelectStyles();
      const appEl = document.getElementById('app');
      if(appEl){
        appEl.addEventListener('change', (e)=>{
          if(e.target && e.target.tagName === 'SELECT') this.updateSingleSelect(e.target);
        });
      }
      // 点击外部关闭设置菜单（全局监听）
      document.addEventListener('click', this.handleGlobalClick);
      // 暴露全局调试句柄，方便在浏览器控制台访问当前 Vue 实例
      try{ window.__APP = this; }catch(e){}
    });

    // Setup server-version polling to detect backend restarts and trigger reload or partial refresh
    const checkServerVersionOnce = async () => {
      try{
        // add cache-busting query and request cache:no-store to avoid 304 responses from browser/proxy cache
        const url = '/api/server-version?_=' + Date.now();
        const r = await this.apiCall(url, { cache: 'no-store' });
        if(r && r.code === 200 && r.data && r.data.startedAt){
          if(this.serverVersion && this.serverVersion !== r.data.startedAt){
            try{ this.showMsg('检测到后端已更新，页面将刷新以保持同步'); }catch(e){}
            setTimeout(()=>{ try{ location.reload(); }catch(e){} }, 700);
          }else{
            this.serverVersion = r.data.startedAt;
          }
        }
      }catch(e){ /* ignore transient network errors */ }
    };
    // initial check and periodic polling every 15 seconds
    try{ checkServerVersionOnce.call(this); this._serverVersionTimer = setInterval(checkServerVersionOnce.bind(this), 15000); }catch(e){}
  },
  beforeDestroy(){
  try{ document.removeEventListener('click', this.handleGlobalClick); }catch(e){}
  try{ if(this._serverVersionTimer) clearInterval(this._serverVersionTimer); }catch(e){}
  },
  methods:{
    // 格式化时间为本地可读字符串：YYYY-MM-DD HH:mm:ss，空值返回 '-'
    formatTime(val){
      if(!val) return '-';
      try{
        const d = new Date(val);
        if(isNaN(d.getTime())) return '-';
        const pad = (n)=> n.toString().padStart(2,'0');
        const Y = d.getFullYear();
        const M = pad(d.getMonth()+1);
        const D = pad(d.getDate());
        const h = pad(d.getHours());
        const m = pad(d.getMinutes());
        const s = pad(d.getSeconds());
        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
      }catch(e){return '-';}
    },
    showMsg(msg,type='success'){
      try{
        const container = document.getElementById('toast-container');
        if(!container) return;
        const div = document.createElement('div');
        div.className = 'toast ' + (type==='success' ? 'success' : 'error');
        div.textContent = msg;
        container.appendChild(div);
        // 自动消失 1 秒
        setTimeout(()=>{
          try{ container.removeChild(div); }catch(e){}
        }, 1000);
      }catch(e){ console.error('showMsg error', e); }
    },
    maybeShowExpiredTooltip(item, e){
      try{
        if(!item) return;
        const isExpired = (item.expired==1) || (item.visitStatus === '过期单') || (item.intent === '无效');
        if(!isExpired) return;
        // Prefer expiredReason from item if present
        if(item.expiredReason && item.expiredReason !== ''){
          this.tooltipText = item.expiredReason;
        }else{
          // fetch latest clue data to get expiredReason
          this.fetchClueById(item.id).then(updated => {
            if(updated && updated.expiredReason) this.tooltipText = updated.expiredReason;
            else this.tooltipText = '过期原因：系统判定为过期';
          }).catch(()=>{ this.tooltipText = '过期原因：无法获取详情'; });
        }
        // position tooltip near mouse (offset to avoid cursor overlap)
        const offsetX = 12, offsetY = 12;
        this.tooltipX = (e && e.clientX ? e.clientX + offsetX : (this.tooltipX || 0));
        this.tooltipY = (e && e.clientY ? e.clientY + offsetY : (this.tooltipY || 0));
        this.tooltipVisible = true;
        // auto-hide after 6s
        setTimeout(()=>{ this.tooltipVisible = false; }, 6000);
      }catch(err){ console.warn('maybeShowExpiredTooltip error', err); }
    },
    hideExpiredTooltip(){ this.tooltipVisible = false; this.tooltipText = ''; },
    clearDetailError(field){ try{ if(this.detailErrors && this.detailErrors[field]){ this.$set ? this.$delete ? this.$delete(this.detailErrors, field) : delete this.detailErrors[field] : delete this.detailErrors[field]; } }catch(e){ /* ignore */ } },
    updateSingleSelect(el){
      if(!el) return;
      try{
        const val = el.value;
        const selectedText = (el.options && el.selectedIndex>=0) ? (el.options[el.selectedIndex].text || '') : '';
        // treat empty value and several placeholder texts as faded
        const fadedWords = ['请选择','未到诊','未预约','未分配','全部'];
        if(val === '' || fadedWords.includes(selectedText) || fadedWords.includes(val)){
          el.classList.add('select-empty');
          el.classList.remove('select-normal');
        }else{
          el.classList.remove('select-empty');
          el.classList.add('select-normal');
        }
      }catch(e){/* ignore */}
    },
    updateSelectStyles(){
      const selects = document.querySelectorAll('#app select');
      selects.forEach(s=>{
        try{
          const txt = (s.options && s.selectedIndex>=0) ? (s.options[s.selectedIndex].text || '') : '';
          const fadedWords = ['请选择','未到诊','未预约','未分配','全部'];
          if(s.value === '' || s.value === null || fadedWords.includes(txt) || fadedWords.includes(s.value)) {
            s.classList.add('select-empty'); s.classList.remove('select-normal');
          }else{
            s.classList.remove('select-empty'); s.classList.add('select-normal');
          }
        }catch(e){}
      });
    },
    // 右上浮动操作面板
    showRowActions(item){
      this.selectedRow = item;
      this.showRowActionsFlag = true;
      this.showInlineDetail = false;
    },
    hideRowActions(){ this.showRowActionsFlag = false; this.selectedRow = null; this.showInlineDetail = false },
    toggleInlineDetail(){ this.showInlineDetail = !this.showInlineDetail },
    async addInlineVisit(){
      if(!this.inlineVisitContent) { this.showMsg('请输入回访内容','error'); return }
      if(!this.selectedRow || !this.selectedRow.id){ this.showMsg('未选择线索','error'); return }
      this.inlineLoading = true;
      try{
        const payload = { id: this.selectedRow.id, content: this.inlineVisitContent, user: (this.user && this.user.username) || '' };
        const res = await this.apiCall('/api/visit', { method: 'POST', body: JSON.stringify(payload) });
        if(res && res.code === 200){
          // 刷新回访列表
          const d = await this.apiCall('/api/visit/' + this.selectedRow.id);
          if(d && d.code === 200){
            this.currentVisit = d.data || [];
          }
          this.inlineVisitContent = '';
          this.showMsg('回访已添加');
        }
      }catch(e){console.error('addInlineVisit error', e); this.showMsg('添加失败','error')}
      finally{ this.inlineLoading = false }
    },
    // 设置菜单控制相关
    toggleSettings(){ this.settingsOpen = !this.settingsOpen; },
    closeSettings(){ this.settingsOpen = false; },
    // 全局点击用于关闭右上面板（若点击非面板区域）
    handleGlobalClick(e){
      try{
        const settingsEl = this.$refs.settings;
        if(settingsEl && !settingsEl.contains(e.target)){
          this.closeSettings();
        }
      }catch(err){/* ignore */}
      try{
        const rowPanel = document.querySelector('.row-actions');
        if(rowPanel && !rowPanel.contains(e.target)){
          this.hideRowActions();
        }
      }catch(err){}
    },
    getAuth(){
      // 仅使用内存中的 auth，页面刷新需重新登录以获取新 token
      try{
        if(this.user && this.user.auth) return this.user.auth;
      }catch(e){/* ignore */}
      return '';
    },
    // 返回通过后端代理访问图片的 URL（优先用于绕过 R2 直接访问失败或权限问题）
    getImageProxyUrl(key){
      if(!key) return '';
      // 当页面以 file:// 打开或在本地开发时，明确使用本地后端地址
      if (window.location.protocol === 'file:') return 'http://localhost:3000/api/image?key=' + encodeURIComponent(key);
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1';
      if (isLocalHost) return 'http://localhost:3000/api/image?key=' + encodeURIComponent(key);
      // 远程页面使用 page origin（后端已在同源下实现代理），相对路径足够
      return window.location.origin + '/api/image?key=' + encodeURIComponent(key);
    },
    async apiCall(url,options={}){
      try{
        const token = this.getAuth();
        const headers = {
          ...options.headers,
          ...(token ? { Authorization: 'Bearer ' + token } : {})
        };
        if (options.body && !headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }

        const isRemote = window.location.hostname !== 'localhost' &&
                        window.location.hostname !== '127.0.0.1' &&
                        window.location.hostname !== '::1' &&
                        window.location.protocol !== 'file:';

        let baseUrl;
        if (window.location.protocol === 'file:' || window.location.protocol === 'null') {
          baseUrl = 'http://localhost:3000';
        } else if (isRemote) {
          baseUrl = window.location.origin;
        } else {
          baseUrl = 'http://localhost:3000';
        }

        const primaryUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

        // 尝试第一次请求
        // prevent cached 304 responses for API endpoints (ensure fresh data)
        let fetchOptions = Object.assign({}, options, { headers, mode: 'cors', targetAddressSpace: 'local' });
        // For API paths prefer no-store to bypass browser/proxy cache
        try{ fetchOptions.cache = 'no-store'; }catch(err){}
        let res = await fetch(primaryUrl, fetchOptions);

        // 如果返回不是 JSON（例如 HTML 错误页），并且我们是通过远程 origin 访问页面，尝试回退到本地直接访问
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('application/json')){
          // 若 primaryUrl 使用的是 page origin（远程），尝试直接访问本地 API
          try{
            const localUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
            if (localUrl !== primaryUrl){
              const fallback = await fetch(localUrl, {
                ...options,
                headers,
                mode: 'cors',
                targetAddressSpace: 'local'
              });
              const fct = (fallback.headers.get('content-type') || '').toLowerCase();
              if (fct.includes('application/json')){
                res = fallback;
              }
            }
          }catch(fbErr){
            // fallback 失败则继续使用原始响应用于错误信息
            console.warn('apiCall fallback failed', fbErr);
          }
        }

        // 尝试解析响应为文本再做 JSON 解析（以便在收到 HTML 时记录更清楚的错误）
        const text = await res.text();
        try{
          const data = JSON.parse(text);
          if(data.code!==200){
            // 如果是后端明确返回的 duplicate（409），保留原始响应让调用方处理（例如展示详情或触发强制插入）
            if(data.code === 409 && (data.msg === 'duplicate' || data.msg === 'duplicate_phone' || data.msg === 'duplicate_wechat')){
              return data;
            }
            this.showMsg(data.msg || '服务器返回错误','error');
            return data;
          }
          return data;
        }catch(parseErr){
          console.error('apiCall error: response not JSON', { url: primaryUrl, status: res.status, text });
          // 如果返回是 HTML（包含 <!DOCTYPE 或 <html），提示更明确的信息
          if((text||'').trim().startsWith('<')){
            this.showMsg('服务器返回 HTML 错误页（可能请求被代理到错误的主机），请检查后端服务地址与 CORS 设置','error');
          }else{
            this.showMsg('服务器返回无法解析的响应','error');
          }
          return {code:500};
        }
      }catch(e){
        console.error('apiCall error', e);
        this.isLoading=false;
        if (window.location.hostname !== 'localhost' && 
            window.location.hostname !== '127.0.0.1' && 
            window.location.hostname !== '::1') {
          this.showMsg('远程访问网络错误，请检查 Cloudflare tunnel 配置或确保本地后端允许外部访问','error');
        } else {
          this.showMsg('网络错误','error');
        }
        return {code:500};
      }
    },
    // 返回给定记录应使用的开药天数选项（按记录的 recTime 与切换日期判断）
    getMedicineDayOptionsForRecord(item){
      try{
        const legacy = ['小于7天','7-14天','15-21天','21天以上','未开药','未支付'];
        const neu = ['14天以下','14-21天','22-28天','28天以上','未开药','未支付'];
        const transTs = new Date((this.medicineDayTransition || '2026-06-01') + 'T00:00:00').getTime();
        let t = 0;
        if(item && (item.visitDate || item.createTime)){
          t = new Date(item.visitDate || item.createTime).getTime();
        }
        if(!t) t = Date.now();
        return t >= transTs ? neu : legacy;
      }catch(e){ return ['14天以下','14-21天','22-28天','28天以上','未开药','未支付']; }
    },
    // 返回创建/编辑表单应使用的开药天数选项（按当前时间判断）
    getMedicineDayOptionsForForm(){
      try{ const transTs = new Date((this.medicineDayTransition || '2026-06-01') + 'T00:00:00').getTime(); return Date.now() >= transTs ? ['14天以下','14-21天','22-28天','28天以上','未开药','未支付'] : ['小于7天','7-14天','15-21天','21天以上','未开药','未支付']; }catch(e){ return ['14天以下','14-21天','22-28天','28天以上','未开药','未支付']; }
    },
    async login(){
      if(!this.loginUser||!this.loginPwd){this.loginError="用户名和密码不能为空";return;}
      const data=await this.apiCall("/api/login",{
        method:"POST",
        body:JSON.stringify({username:this.loginUser,password:this.loginPwd})
      });
      if(data.code===200){
        this.isLogin=true;
        // 后端返回 { username, role, auth }
        // 只保存在内存中，避免在页面重新打开时自动恢复登录
        this.user = { username: data.data.username, role: data.data.role, auth: data.data.auth };
        console.debug('login: user info', this.user);
        this.loginError="";
        this.getDoctors();
      }else{
        this.loginError=(data.msg==='网络错误' ? '网络错误，请检查本地服务是否启动并且浏览器已允许本地网络请求' : data.msg||"登录失败");
      }
    },
    logout(){
      this.isLogin=false;
      this.user={};
      try{ localStorage.removeItem('user'); }catch(e){}
      this.showDetail=false;
    },
    async getTaoRen(){ return; },
    async getDoctors(){const d=await this.apiCall("/api/doctors");if(d.code===200)this.doctorList=d.data;},
    async getRevisitList(){
      // 传入 month 参数，后端以 COALESCE(visitDate, createTime) 为月口径进行过滤
      const month = (this.revisitMonth && this.revisitMonth !== '全部') ? this.revisitMonth : '';
      const q = month ? ('?month=' + encodeURIComponent(month)) : '';
      const d = await this.apiCall('/api/revisitList' + q);
      if(d && d.code === 200){
        this.revisitList = d.data || [];
        // 默认按到诊时间（visitDate 优先，兜底为 createTime）降序排列，最新到诊排在前面
        try{
          this.revisitList.sort((a,b)=>{
            const ta = new Date(a.visitDate || a.createTime).getTime() || 0;
            const tb = new Date(b.visitDate || b.createTime).getTime() || 0;
            return tb - ta;
          });
        }catch(e){console.warn('revisitList sort error', e)}
        this.revisitShowList = [...this.revisitList];
        // apply any active search
        this.doRevisitSearch();
      }
    },
    // 图片上传相关方法
    async handleImageFiles(e){
      const files = (e.target && e.target.files) ? Array.from(e.target.files) : [];
      for(const f of files){
        try{
          // 压缩/缩放图片以减少上传体积，提高上传速度
          const compressed = await this.compressImage(f, 1600, 0.78);
          // 保持原始文件信息但上传使用 compressed（File 或 Blob）
          const uploadFile = (compressed instanceof File) ? compressed : new File([compressed], (f.name || 'upload').replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' });
          const preview = URL.createObjectURL(uploadFile);
          this.uploadQueue.push({ file: f, uploadFile, preview, status: 'pending' });
        }catch(err){ console.warn('preview/compress error', err); const preview = URL.createObjectURL(f); this.uploadQueue.push({ file: f, uploadFile: f, preview, status: 'pending' }); }
      }
      // 自动开始上传未上传的项（并发由 uploadSingle 控制）
      this.uploadQueue.forEach((q, idx)=>{ if(q.status === 'pending') this.uploadSingle(idx); });
      // reset input value so same file can be re-selected
      try{ e.target.value = ''; }catch(e){}
    },

    // 在浏览器端压缩图片：限制最长边为 maxSide，质量 quality（0-1）
    async compressImage(file, maxSide = 1600, quality = 0.8){
      if(!file || !(file.type || '').startsWith('image/')) return file;
      // 优先使用 createImageBitmap（性能更好），回退到 Image
      try{
        const imgBitmap = await createImageBitmap(file);
        let sw = imgBitmap.width, sh = imgBitmap.height;
        const max = Math.max(sw, sh);
        if(max <= maxSide){
          // 不需要缩放
          imgBitmap.close && imgBitmap.close();
          return file;
        }
        const scale = maxSide / max;
        const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
        const canvas = document.createElement('canvas');
        canvas.width = dw; canvas.height = dh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgBitmap, 0, 0, dw, dh);
        imgBitmap.close && imgBitmap.close();
        return await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if(!blob) return resolve(file);
            resolve(blob);
          }, 'image/jpeg', quality);
        });
      }catch(e){
        // 回退实现：使用 Image 对象
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function(ev){
            const img = new Image();
            img.onload = function(){
              let sw = img.width, sh = img.height;
              const max = Math.max(sw, sh);
              if(max <= maxSide){ resolve(file); return; }
              const scale = maxSide / max;
              const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
              const canvas = document.createElement('canvas');
              canvas.width = dw; canvas.height = dh;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, dw, dh);
              canvas.toBlob((blob)=>{ if(!blob) resolve(file); else resolve(blob); }, 'image/jpeg', quality);
            };
            img.onerror = function(){ resolve(file); };
            img.src = ev.target.result;
          };
          reader.onerror = function(){ resolve(file); };
          reader.readAsDataURL(file);
        });
      }
    },
    async uploadSingle(idx){
      const q = this.uploadQueue[idx];
      if(!q || q.status === 'uploading' || q.status === 'done') return;
      q.status = 'uploading';
      try{
        const form = new FormData();
        // 优先使用压缩后的 uploadFile（如存在），否则回退到原文件
        form.append('image', q.uploadFile || q.file, q.file && q.file.name ? q.file.name : 'upload.jpg');
        const token = this.user && this.user.auth ? this.user.auth : '';
        // 如果当前正在查看某条已有线索，则把 clueId 作为 query param 传给后端以便立即关联图片
        const base = (window.location.protocol === 'file:' ? 'http://localhost:3000' : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin));
        let uploadUrl = base + '/api/uploadImage' + (this.currentDetail && this.currentDetail.id ? ('?clueId=' + encodeURIComponent(this.currentDetail.id)) : '');
        if(this.revisitDraftId){
          uploadUrl += (uploadUrl.indexOf('?')===-1 ? '?' : '&') + 'visitId=' + encodeURIComponent(this.revisitDraftId);
        }
        const res = await fetch(uploadUrl, {
          method: 'POST',
          body: form,
          headers: token ? { Authorization: 'Bearer ' + token } : {}
        });
        const text = await res.text();
        let data;
        try{ data = JSON.parse(text); }catch(e){ throw new Error('服务器返回非 JSON'); }
        if(data && data.code === 200 && data.data){
          q.status = 'done';
          const newItem = Object.assign({}, data.data, { filename: q.file.name });
          // 避免重复：如果已存在相同 key 的图片（无论在 uploadedImages 还是 currentDetail.images），则不再添加
          const k = newItem.key;
          const existsInUploaded = this.uploadedImages.some(x => x.key === k);
          const existsInDetail = (this.currentDetail && Array.isArray(this.currentDetail.images)) ? this.currentDetail.images.some(x => x.key === k) : false;
          if(!existsInUploaded && !existsInDetail){
            this.uploadedImages.push(newItem);
          } else {
            // 如果图片已被后端直接关联到当前 detail（clueId），也把它放到 currentDetail.images（去重后）以便立即显示
            if(newItem.clueId && this.currentDetail && String(newItem.clueId) === String(this.currentDetail.id)){
              const exists = (this.currentDetail.images || []).some(x => x.key === k);
              if(!exists){
                try{
                  if(this.$set){
                    const arr = (this.currentDetail.images && Array.isArray(this.currentDetail.images)) ? this.currentDetail.images.concat([newItem]) : [newItem];
                    this.$set(this.currentDetail, 'images', arr);
                  }else if(typeof Vue !== 'undefined' && Vue.set){
                    const arr = (this.currentDetail.images && Array.isArray(this.currentDetail.images)) ? this.currentDetail.images.concat([newItem]) : [newItem];
                    Vue.set(this.currentDetail, 'images', arr);
                  }else{
                    this.currentDetail.images = this.currentDetail.images || [];
                    this.currentDetail.images.push(newItem);
                  }
                }catch(e){
                  this.currentDetail.images = this.currentDetail.images || [];
                  this.currentDetail.images.push(newItem);
                }
              }
            }
          }
          // 上传成功后移除 uploadQueue 中的预览项，避免在上传列表与已上传列表同时显示相同图片
          try{ if(q.preview) URL.revokeObjectURL(q.preview); }catch(e){}
          // 注意：splice 会更新数组索引，但我们只移除当前项（idx），这是安全的
          this.uploadQueue.splice(idx, 1);
        }else{
          q.status = 'error';
          console.warn('upload failed', data);
        }
      }catch(err){
        console.error('uploadSingle error', err);
        if(q) q.status = 'error';
      }
    },
    retryUpload(idx){ if(this.uploadQueue[idx]) this.uploadSingle(idx); },
    removeQueued(idx){
      const it = this.uploadQueue[idx];
      if(it && it.preview) try{ URL.revokeObjectURL(it.preview); }catch(e){}
      this.uploadQueue.splice(idx,1);
    },
    removeUploaded(ii){
      const item = this.uploadedImages[ii];
      // 请求后端删除元数据与对象（可选：目前仅在前端移除）
      this.uploadedImages.splice(ii,1);
    },

    doRevisitSearch(){
      try{
        const list = this.revisitList || [];
        this.revisitShowList = list.filter(item => {
          if(this.revisitSearch.id && !((''+item.id).includes(this.revisitSearch.id))) return false;
          if(this.revisitSearch.name && !(item.name||'').includes(this.revisitSearch.name)) return false;
          if(this.revisitSearch.phone && !(item.phone||'').includes(this.revisitSearch.phone)) return false;
          if(this.revisitSearch.wechat && !(item.wechat||'').includes(this.revisitSearch.wechat)) return false;
          if(this.revisitSearch.doctor && ((item.doctor||'') !== this.revisitSearch.doctor)) return false;
          // 到诊时间以 visitDate 优先，否则用 createTime
          if(this.revisitSearch.arriveStart){
            const t = new Date(item.visitDate || item.createTime);
            const start = new Date(this.revisitSearch.arriveStart + 'T00:00:00');
            if(isNaN(t.getTime()) || t < start) return false;
          }
          if(this.revisitSearch.arriveEnd){
            const t = new Date(item.visitDate || item.createTime);
            const end = new Date(this.revisitSearch.arriveEnd + 'T23:59:59');
            if(isNaN(t.getTime()) || t > end) return false;
          }
          return true;
        });
        // 筛选后也按到诊时间降序排序
        try{
          this.revisitShowList.sort((a,b)=>{
            const ta = new Date(a.visitDate || a.createTime).getTime() || 0;
            const tb = new Date(b.visitDate || b.createTime).getTime() || 0;
            return tb - ta;
          });
        }catch(e){ console.warn('revisitShowList sort error', e); }
      }catch(e){ console.error('doRevisitSearch error', e); this.revisitShowList = [...this.revisitList]; }
    },

    resetRevisitSearch(){ this.revisitSearch = { id:'', name:'', phone:'', wechat:'', doctor:'', arriveStart:'', arriveEnd:'' }; },
    // 复诊分页控制
    resetRevisitPage(){ this.revisitCurrentPage = 1; this.revisitTotalPage = Math.ceil((this.revisitShowList||[]).length / this.revisitPageSize) || 1; },
    prevRevisitPage(){ if(this.revisitCurrentPage>1) this.revisitCurrentPage--; },
    nextRevisitPage(){ if(this.revisitCurrentPage < this.revisitTotalPage) this.revisitCurrentPage++; },
    // 计算某条线索在复诊列表中出现的次数（至少显示 1，最大显示 9）
    revisitCountDisplay(item){
      if(!item) return 1;
      // 优先使用后端返回的 revisitCount
      if(typeof item.revisitCount !== 'undefined' && item.revisitCount !== null) return Math.min(Math.max(Number(item.revisitCount)||1,1),9);
      try{
        const c = this.revisitList.filter(x => (x.revisitGroupId || x.id) === (item.revisitGroupId || item.id)).length || 1;
        return Math.min(Math.max(c,1),9);
      }catch(e){return 1}
    },
    openScheduleRevisit(item){
      if(!item || !item.id) return;
      // ensure bookUser is initialized to current user so the disabled input reflects a real model value
      this.revisitForm = { baseItemId: item.id, doctor: item.doctor || '', bookUser: (this.user && this.user.username) || '', visitMode: '', visitDate: '', dosageForm: '', medicineDay: '' };
      this.revisitModalVisible = true;
    },
    closeScheduleRevisit(){
      this.revisitModalVisible = false;
      this.revisitForm = { baseItemId: '', doctor: '', bookUser: '', visitMode: '', visitDate: '', dosageForm: '', medicineDay: '' };
    },
    async submitScheduleRevisit(){
      const f = this.revisitForm;
      if(!f.baseItemId){ this.showMsg('无效的复诊来源','error'); return }
      if(!f.doctor){ this.showMsg('请选择复诊预约医生','error'); return }
      if(!f.bookUser){ this.showMsg('请选择复诊预约人员','error'); return }
      if(!f.visitMode){ this.showMsg('请选择就诊方式','error'); return }
      if(!f.visitDate){ this.showMsg('请选择到诊时间','error'); return }

      // 调用后端持久化安排复诊
      this.isLoading = true;
      try{
        const payload = {
          baseId: f.baseItemId,
          doctor: f.doctor,
          bookUser: f.bookUser,
          visitMode: f.visitMode,
          visitDate: f.visitDate
        };
        const res = await this.apiCall('/api/scheduleRevisit', { method: 'POST', body: JSON.stringify(payload) });
        if(res && res.code === 200){
          this.showMsg('复诊已安排并保存');
          this.closeScheduleRevisit();
          // 刷新复诊列表以获取最新的 revisitCount
          await this.getRevisitList();
        }
      }catch(e){ console.error('submitScheduleRevisit error', e); this.showMsg('安排失败','error'); }
      finally{ this.isLoading = false }
    },
    // 权限判断：若当前用户角色等于目标角色，或当前用户为 主管/超级管理员，则视为有该角色权限
    can(role){
      try{ if(!this.user || !this.user.role) return false; const r = this.user.role; return r===role || r==='主管' || r==='超级管理员'; }catch(e){return false}
    },
    
    // 页面加载时尝试从 localStorage 恢复登录状态
    async mountedRecover(){
      // 为了要求用户每次打开页面重新登录，此方法保留但不从 localStorage 恢复登录状态
      return;
    },
    async getLogs(page){
      try{
        if(!page) page = this.logCurrentPage || 1;
        const q = [];
        if(this.logClueId && this.logClueId.trim()) q.push('clueId='+encodeURIComponent(this.logClueId.trim()));
        if(this.logStart) q.push('startDate='+encodeURIComponent(this.logStart));
        if(this.logEnd) q.push('endDate='+encodeURIComponent(this.logEnd));
        q.push('page='+encodeURIComponent(page));
        q.push('pageSize='+encodeURIComponent(this.logPageSize));
        const url = '/api/logs' + (q.length?('?'+q.join('&')):'');
        const d = await this.apiCall(url);
        if(d.code===200){
          // 兼容两种后端返回格式：
          // 1) 旧版： data 为数组 -> d.data (array)
          // 2) 新版： data 为对象 { rows, total } -> d.data.rows
          if(Array.isArray(d.data)){
            this.logs = d.data;
            this.logTotal = d.data.length;
          }else if(d.data && Array.isArray(d.data.rows)){
            this.logs = d.data.rows;
            this.logTotal = d.data.total || this.logs.length;
          }else{
            // 没有匹配的格式，清空并打印调试信息
            this.logs = [];
            this.logTotal = 0;
            console.warn('getLogs: unexpected response format', d);
          }
          this.logTotalPage = Math.max(1, Math.ceil(this.logTotal / this.logPageSize));
          // bounds
          this.logCurrentPage = Math.min(Math.max(1, page), this.logTotalPage);
        }
      }catch(e){ console.error('getLogs error', e); }
    },
    resetLogPage(){ this.logCurrentPage = 1; this.getLogs(1); },
    prevLogPage(){ if(this.logCurrentPage>1){ this.logCurrentPage--; this.getLogs(this.logCurrentPage); } },
    nextLogPage(){ if(this.logCurrentPage < this.logTotalPage){ this.logCurrentPage++; this.getLogs(this.logCurrentPage); } },
    selectDoc(){let f=this.doctorList.find(x=>x.name==this.form.doctor);if(f)this.form.department=f.dept;},
    async save(){
      // Ensure taoRen is set to current logged-in user (front-end convenience).
      try{ this.form.taoRen = (this.user && this.user.username) || this.form.taoRen || ''; }catch(e){}
      const errors = [];
      if(!this.form.channel) errors.push('渠道');
      if(!this.form.name) errors.push('客户姓名');
      if(!this.form.phone && !this.form.wechat) errors.push('电话或微信（至少填一个）');
      if(!this.form.doctor) errors.push('医生');
      if(errors.length > 0){
        this.showMsg('请填写：' + errors.join('、'), 'error');
        return;
      }
      // 重复校验：如果有电话或微信，先检查是否已存在相同的线索
      let allowForce = false;
      try{
        const phoneTrim = (this.form.phone || '').toString().trim();
        const wechatTrim = (this.form.wechat || '').toString().trim();
        if(phoneTrim || wechatTrim){
          // 请求后端返回所有匹配行以便前端判断（后端支持 body.all === true 返回数组）
          const dupResp = await this.apiCall('/api/list', {
            method: 'POST',
            body: JSON.stringify({ phone: phoneTrim, wechat: wechatTrim, all: true })
          });
          let matches = [];
          if(dupResp && dupResp.code === 200){
            if(Array.isArray(dupResp.data)) matches = dupResp.data;
            else if(dupResp.data && Array.isArray(dupResp.data.rows)) matches = dupResp.data.rows;
          }
          if(matches.length > 0){
            // 取最近的一条
            const sorted = matches.slice().sort((a,b)=> new Date(b.createTime) - new Date(a.createTime));
            const last = sorted[0];
            // 如果最近一条被判定为“过期单”，允许用户继续录入但需确认
              try{
              const serverExpired = (typeof last.expired !== 'undefined') ? !!last.expired : this.isExpiredClue(last);
              if(serverExpired){
                const lastDoctor = last.doctor || '';
                const currentDoctor = this.form.doctor || '';
                // 如果是同一医生，不允许再次录入
                if(lastDoctor && currentDoctor && lastDoctor === currentDoctor){
                  const info = `检测到相同医生(${lastDoctor})的过期单，禁止再次录入。`;
                  try{ alert(info); }catch(e){ console.warn('show same-doctor duplicate alert failed', e); }
                  return;
                }
                // 不同医生：提示确认，确认后直接标记为强制插入（后端将放行并生成新 ID）
                const msg = `检测到相同电话/微信的历史话单为过期单（录入医生：${lastDoctor || '未知'}，录入时间：${last.createTime || '未知'}）\n\n此话单为过期单，之前已咨询过 ${lastDoctor || '未知'}，确认是否继续由当前医生（${currentDoctor || '未知'}）录入新的话单？`;
                const ok = confirm(msg);
                if(!ok) return;
                // 用户确认则允许继续录入并在提交时带上强制标识，后端可放行
                allowForce = true;
              }else{
                // 非过期单：阻止新增并提示查看现有线索
                const info = `检测到相同电话/微信已录入线索\n录入时间：${last.createTime || '未知'}\n所属医生：${last.doctor || '未知'}\n套电人员：${last.taoRen || '未知'}\n\n已阻止新增，请先查看现有线索。`;
                try{ alert(info); }catch(e){ console.warn('show duplicate alert failed', e); }
                return;
              }
            }catch(e){ console.error('duplicate check handling error', e); return; }
          }
        }
      }catch(e){
        console.error('重复校验异常', e);
      }
      this.isLoading=true;
      // include uploaded image keys (if any)
      const images = (this.uploadedImages || []).map(i => i.key).filter(Boolean);
      const payload = Object.assign({}, this.form, { createTime: new Date().toISOString(), images, forceInsert: allowForce });
      // 强制使用当前登录账号作为套电人员（前端保证）
      try{ payload.taoRen = (this.user && this.user.username) || payload.taoRen || ''; }catch(e){}
      const data=await this.apiCall("/api/save",{
        method:"POST",
        body:JSON.stringify(payload)
      });
      this.isLoading=false;
      // 后端可能返回 409 duplicate：在 apiCall 我们保留了原始响应，这里针对 duplicate 做更友好的处理
      if(data && data.code === 409 && data.msg && data.msg.indexOf('duplicate') === 0){
        const ex = data.existing || {};
        const info = `检测到相同电话/微信的已录入线索\n录入时间：${ex.createTime||'未知'}\n所属医生：${ex.doctor||'未知'}\n套电人员：${ex.taoRen||'未知'}\n\n点击确定查看详情，点击取消尝试强制录入（若仍需创建新话单）。`;
        try{
          const ok = confirm(info);
          if(ok){
            // 打开详情查看已存在线索
            try{ this.openDetail(ex); }catch(e){ console.warn('openDetail on duplicate failed', e); }
            return;
          }else{
            // 用户选择强制录入：带上 forceInsert 重试一次
            payload.forceInsert = true;
            this.isLoading = true;
            const forced = await this.apiCall("/api/save",{ method:"POST", body:JSON.stringify(payload) });
            this.isLoading = false;
            if(forced && forced.code === 200){
              this.showMsg('提交成功');
              this.form={taoRen:"",channel:"",name:"",gender:"",age:"",phone:"",wechat:"",doctor:"",department:"",content:""};
              try{ this.uploadQueue = []; this.uploadedImages = []; }catch(e){}
            }else{
              // 重试仍非 200：如果再次返回 duplicate，打开详情；否则由 apiCall 已显示错误
              if(forced && forced.code === 409 && forced.existing){ try{ this.openDetail(forced.existing); }catch(e){} }
            }
            return;
          }
        }catch(e){ console.error('duplicate handling confirmation failed', e); return; }
      }

      if(data && data.code===200){
        this.showMsg('提交成功');
        this.form={taoRen:"",channel:"",name:"",gender:"",age:"",phone:"",wechat:"",doctor:"",department:"",content:""};
        // clear upload lists
        try{ this.uploadQueue = []; this.uploadedImages = []; }catch(e){}
      }
    },
    // 打开复诊/咨询回访弹窗（查看/添加回访记录）
    // 第二个参数 ctx: '咨询' 或 '复诊'，用于区分弹窗标题与上下文
    async openRevisitVisit(item, ctx){
      if(!item || !item.id) return;
      this.selectedRevisitItem = item;
      this.revisitVisitContent = '';
      this.revisitVisitList = [];
      // context for modal title: default to 咨询
      this.revisitVisitContext = ctx || '咨询';
      try{
        const res = await this.apiCall('/api/visit/' + item.id);
        if(res && res.code === 200){
          // normalize list and include optional note; we'll sort by time asc (oldest first)
          let list = (res.data || []).slice();
          try{
            const note = item.content || item.note || item.remark || '';
            if(note && typeof note === 'string' && note.trim() !== ''){
              const entry = {
                time: item.createTime || item.uploadedAt || new Date().toISOString(),
                user: item.username || item.taoRen || '录入',
                content: note
              };
              // avoid exact duplicate content/user in existing list
              const exists = list.find(x => x && x.content === entry.content && x.user === entry.user);
              if(!exists) list.push(entry);
            }
          }catch(e){ console.warn('prepend note to revisit list failed', e); }

          // sort ascending by time (older first)
          list.sort((a,b) => {
            const ta = new Date(a && a.time ? a.time : 0).getTime();
            const tb = new Date(b && b.time ? b.time : 0).getTime();
            return ta - tb;
          });
          this.revisitVisitList = list;
        }
      }catch(e){ console.error('openRevisitVisit error', e); }
      this.showRevisitVisitModal = true;
    },
    closeRevisitVisit(){ this.showRevisitVisitModal = false; this.selectedRevisitItem = null; this.revisitVisitList = []; this.revisitVisitContent = ''; },
    async submitRevisitVisit(){
      if(!this.revisitVisitContent || !this.selectedRevisitItem) { this.showMsg('请输入回访内容','error'); return }
      this.isLoading = true;
      try{
        const payload = { id: this.selectedRevisitItem.id, content: this.revisitVisitContent, user: (this.user && this.user.username) || '' };
        const res = await this.apiCall('/api/visit', { method: 'POST', body: JSON.stringify(payload) });
        if(res && res.code === 200){
          // 刷新回访列表
          const d = await this.apiCall('/api/visit/' + this.selectedRevisitItem.id);
          if(d && d.code === 200) this.revisitVisitList = d.data || [];
          this.revisitVisitContent = '';
          this.showMsg('回访已添加');
        }
      }catch(e){ console.error('submitRevisitVisit error', e); this.showMsg('添加失败','error'); }
      finally{ this.isLoading = false }
    },
    async submitDetailRevisit(){
      if(!this.revisitVisitContent || !this.currentDetail || !this.currentDetail.id){ this.showMsg('请输入回访内容','error'); return }
      this.isLoading = true;
      try{
        // If we have a draft visit created during uploads, update that visit; otherwise insert a new visit row
        if(this.revisitDraftId){
          const upd = await this.apiCall('/api/updateVisit', { method: 'POST', body: JSON.stringify({ id: this.revisitDraftId, content: this.revisitVisitContent }) });
          if(upd && upd.code === 200){
            const d = await this.apiCall('/api/visit/' + this.currentDetail.id);
            if(d && d.code === 200) this.currentVisit = d.data || [];
            await this.fetchAndApplyCurrentDetail(this.currentDetail.id);
            this.revisitVisitContent = '';
            this.showMsg('回访已添加');
            // clear draft id after successful submit
            this.revisitDraftId = null;
          }
        }else{
          const payload = { id: this.currentDetail.id, content: this.revisitVisitContent, user: (this.user && this.user.username) || '' };
          const res = await this.apiCall('/api/visit', { method: 'POST', body: JSON.stringify(payload) });
          if(res && res.code === 200){
            const d = await this.apiCall('/api/visit/' + this.currentDetail.id);
            if(d && d.code === 200) this.currentVisit = d.data || [];
            await this.fetchAndApplyCurrentDetail(this.currentDetail.id);
            this.revisitVisitContent = '';
            this.showMsg('回访已添加');
          }
        }
      }catch(e){ console.error('submitDetailRevisit error', e); this.showMsg('添加失败','error'); }
      finally{ this.isLoading = false }
    },

    async deleteImage(img){
      try{
        if(!img || !img.id){ this.showMsg('无效的图片','error'); return; }
        const ok = confirm('确认删除此图片吗？此操作不可恢复。');
        if(!ok) return;
        this.isLoading = true;
        const res = await this.apiCall('/api/deleteImage', { method: 'POST', body: JSON.stringify({ id: img.id }) });
        if(res && res.code === 200){
          this.showMsg('图片已删除');
          try{
            if(this.currentDetail && Array.isArray(this.currentDetail.images)){
              this.currentDetail.images = this.currentDetail.images.filter(x => String(x.id) !== String(img.id));
            }
            // also refresh edit copy
            this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
          }catch(e){}
        }else{
          this.showMsg((res && res.msg) ? res.msg : '删除失败','error');
        }
      }catch(e){ console.error('deleteImage error', e); this.showMsg('删除失败','error'); }
      finally{ this.isLoading = false; }
    },

    // 返回用于显示的缩略图 URL：优先使用 thumbSmallKey（带版本参数），否则回退到 thumbKey 或原图
    getDisplayThumb(img){
      try{
        if(!img) return '';
        const buildUrlWithVersion = (baseUrl, version) => {
          if(!baseUrl) return '';
          const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
          return baseUrl + sep + 'v=' + encodeURIComponent(version || '');
        };

        // prefer thumbSmallKey if available
        if(img.thumbSmallKey){
          const base = this.getImageProxyUrl(img.thumbSmallKey);
          return buildUrlWithVersion(base, img.thumbSmallKey);
        }
        if(img.thumbKey){
          const base = this.getImageProxyUrl(img.thumbKey);
          return buildUrlWithVersion(base, img.thumbKey);
        }
        if(img.thumbUrl) return img.thumbUrl;
        if(img.key) return this.getImageProxyUrl(img.key);
        if(img.url) return img.url;
        return '';
      }catch(e){ return (img && (img.thumbUrl || img.url)) ? (img.thumbUrl || img.url) : ''; }
    },
    

    // 编辑相关：启动编辑、取消、保存修改
    startEditDetail(){
      this.detailEditing = true;
      this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
    },
    cancelEditDetail(){
      this.detailEditing = false;
      this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
      // clear draft id (we do not delete server-side draft here)
      try{ this.revisitDraftId = null; }catch(e){}
    },
    // 保存详情编辑（包括可能的回访内容/草稿）
    async saveDetailEdits(){
      if(!this.currentDetail || !this.currentDetail.id){ this.showMsg('无效的线索','error'); return; }
      this.isLoading = true;
      // 医助在预约记录（tab==6）模式下，必须填写五项费用/处方字段，且只能修改这五项
      try{
        // clear previous field errors
        try{ this.detailErrors = {}; }catch(e){}
        if(this.user && this.user.role === '医助' && this.tab == 6){
          // 如果 medicineDay 表示未开药或未支付（选项以 '未' 开头），则剂型不必填
          const md = (this.editDetail && this.editDetail.medicineDay) ? String(this.editDetail.medicineDay) : '';
          const needDosageForm = !(md && md.startsWith('未'));
          const required = ['medicineDay','regFee','cost','treatmentFee'];
          if(needDosageForm) required.splice(1,0,'dosageForm'); // insert dosageForm after medicineDay
          const map = {medicineDay:'开药天数', dosageForm:'剂型', regFee:'挂号费', cost:'药费', treatmentFee:'治疗费'};
          const missing = [];
          for(const f of required){
            const v = (this.editDetail && typeof this.editDetail[f] !== 'undefined') ? this.editDetail[f] : undefined;
            if(v === undefined || v === '' || v === null || (['regFee','cost','treatmentFee'].includes(f) && (v === '' || isNaN(Number(v))))){
              missing.push(f);
              // set field-level error message
              try{ this.detailErrors[f] = map[f] + ' 为必填项；若无费用请填写 0'; }catch(e){}
            }
          }
          if(missing.length > 0){
            // keep modal open and display field-level errors
            this.isLoading = false;
            return;
          }
        }
      }catch(e){ console.warn('validate required for 医助 failed', e); }
      try{
        // 将 editDetail 中变更的字段逐个提交（使用现有的 updateInfo 以保证行为一致）
        try{ console.debug('saveDetailEdits: currentDetail.id=', this.currentDetail && this.currentDetail.id, 'editDetail snapshot=', JSON.parse(JSON.stringify(this.editDetail || {}))); }catch(e){}
        const keys = ['channel','name','gender','age','phone','wechat','doctor','department','intent','bookUser','book','visitDate','visitMode','medicineDay','dosageForm','cost','regFee','treatmentFee','content','preCase','createTime'];
        const clientProtected = ['name','phone','wechat','gender','age'];
        // Collect updates and send in one atomic request to avoid partial writes
        const updates = {};
        for(const k of keys){
          try{
            const newVal = this.editDetail && (typeof this.editDetail[k] !== 'undefined') ? this.editDetail[k] : undefined;
            const oldVal = this.currentDetail && (typeof this.currentDetail[k] !== 'undefined') ? this.currentDetail[k] : undefined;
            try{ console.debug('saveDetailEdits: field', k, 'oldVal=', oldVal, 'newVal=', newVal); }catch(e){}
            if(typeof newVal !== 'undefined' && String(newVal) !== String(oldVal)){
              if(clientProtected.includes(k) && (newVal === '' || newVal === null)){
                console.debug('skip empty update for protected field', k, { id: this.currentDetail.id });
              } else {
                updates[k] = newVal;
              }
            }
          }catch(e){ console.warn('collect update field failed', k, e); }
        }
        if(Object.keys(updates).length > 0){
          const resp = await this.apiCall('/api/updateMany', { method: 'POST', body: JSON.stringify({ id: this.currentDetail.id, updates }) });
          if(!resp || resp.code !== 200){
            this.showMsg((resp && resp.msg) ? resp.msg : '保存失败（更新）','error');
            this.isLoading = false;
            return;
          }
        }

        // 处理回访内容：优先更新已有草稿，否则新建回访
        if(this.revisitVisitContent && String(this.revisitVisitContent).trim() !== ''){
          if(this.revisitDraftId){
            await this.apiCall('/api/updateVisit', { method: 'POST', body: JSON.stringify({ id: this.revisitDraftId, content: this.revisitVisitContent }) });
          }else{
            const created = await this.apiCall('/api/createVisit', { method: 'POST', body: JSON.stringify({ id: this.currentDetail.id, content: this.revisitVisitContent }) });
            if(created && created.code === 200 && created.data && created.data.id){
              const newVisitId = created.data.id;
              this.revisitDraftId = newVisitId;
              // 如果在编辑期间有已上传的图片，关联这些图片到该回访
              try{
                const keys = (this.uploadedImages || []).map(i=>i.key).filter(Boolean);
                if(keys.length>0){
                  await this.apiCall('/api/associateImagesToVisit', { method: 'POST', body: JSON.stringify({ visitId: newVisitId, keys }) });
                }
              }catch(e){ console.warn('associate images to visit failed', e); }
            }
          }
          // 刷新回访列表
          try{ const d = await this.apiCall('/api/visit/' + this.currentDetail.id); if(d && d.code===200) this.currentVisit = d.data || []; }catch(e){}
          this.revisitVisitContent = '';
          this.revisitDraftId = null;
        }

        // 最后统一刷新当前线索详情以获取最新图片/字段
        await this.fetchAndApplyCurrentDetail(this.currentDetail.id);
        this.detailEditing = false;
        this.showMsg('保存成功');
      }catch(e){ console.error('saveDetailEdits error', e); this.showMsg('保存失败','error'); }
      finally{ this.isLoading = false }
    },

    // helper to fetch single clue and apply to currentDetail + local lists
    async fetchAndApplyCurrentDetail(id){
      try{
        const updated = await this.fetchClueById(id);
        if(updated){
          // replace currentDetail entirely
          this.currentDetail = updated;
          this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
          this.applyFetchedToLocal(updated);
          this.flashRow(updated.id);
        }
      }catch(e){ console.warn('fetchAndApplyCurrentDetail error', e); }
    },
    // 判断一条线索是否为“过期单”：仅当意向为“无效”时视为过期（已移除基于未回访+30天的判定）
    isExpiredClue(item){
      try{
        if(!item) return false;
        return (item.intent||'').toString() === '无效';
      }catch(e){ console.warn('isExpiredClue error', e); return false; }
    },
    async getList(page){
      const payload = {};
      // copy search filters to payload so server can apply filtering
      if(this.search){
        const keys = ['id','taoRen','bookUser','channel','name','phone','wechat','doctor','intent','book','visitStatus','arrive','startDate','endDate'];
        keys.forEach(k=>{ if(this.search[k]) payload[k]=this.search[k]; });
      }
      const p = page || this.currentPage || 1;
      payload.page = p;
      payload.pageSize = this.pageSize || 10;
      const d = await this.apiCall('/api/list', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if(d.code === 200){
        // server returns { rows, total, page, pageSize } when paged
        if(d.data && d.data.rows){
          this.list = d.data.rows || [];
          this.showList = [...this.list];
          const total = d.data.total || 0;
          const ps = d.data.pageSize || payload.pageSize;
          this.totalPage = Math.max(1, Math.ceil(total / ps));
          this.totalCount = total;
          this.currentPage = d.data.page || p;
        }else{
          // backward compatible: server returned full array
          this.list = d.data || [];
          this.showList = [...this.list];
          this.totalPage = Math.max(1, Math.ceil((this.list && this.list.length)||0 / this.pageSize));
          this.totalCount = this.list.length || 0;
          this.currentPage = 1;
        }
        // 同步未回访统计数字
        try{ this.getUnvisitedCounts(); }catch(e){}
        // 同步过期单统计数字
        try{
          const ec = await this.apiCall('/api/expiredCount');
          if(ec && ec.code === 200 && ec.data){ this.expiredCount = Number(ec.data.count) || 0; }
        }catch(e){ console.warn('get expiredCount failed', e); }
      }
    },

    async getUnvisitedCounts(){
      try{
        const d = await this.apiCall('/api/stats/unvisited');
        if(d && d.code === 200 && d.data){
          this.unvisitedTotal = d.data.totalUnvisited || 0;
          this.unvisitedToday = d.data.todayUnvisited || 0;
        }
      }catch(e){ console.warn('getUnvisitedCounts failed', e); }
    },
    async getBookList(){
      // 如果 search.id 存在，则把 id 作为查询参数传给后端，利用 SQL 精确匹配，并忽略月份过滤
      const parts = [];
      if(this.search && this.search.id){
        parts.push('id=' + encodeURIComponent(this.search.id));
      }else{
        // 传入 month 参数（仅当用户在预约页选择了某月时），后端将以 COALESCE(visitDate, createTime) 为月口径进行过滤
        if(this.bookMonth && this.bookMonth !== '全部') parts.push('month=' + encodeURIComponent(this.bookMonth));
      }
      // include bookUser if provided so server does server-side filtering
      if(this.search && this.search.bookUser){ parts.push('bookUser=' + encodeURIComponent(this.search.bookUser)); }
      const q = parts.length ? ('?' + parts.join('&')) : '';
      const d=await this.apiCall('/api/bookList' + q);
      if(d.code===200){
        // 按到诊时间排序展示：优先使用 visitDate，回退到 createTime
        const toTs = (it)=>{
          const s = it.visitDate || it.createTime || '';
          const t = new Date(s).getTime();
          return Number.isFinite(t) ? t : 0;
        };
        const sorted = (d.data || []).slice().sort((a,b)=>{ return toTs(b) - toTs(a); });
        this.bookList = sorted;
        this.showBookList = [...this.bookList];
        this.doSearch();
      }
    },
    doSearch(){
      // For the main话单列表 (tab==2) use server-side search/pagination
      if(this.tab == 2){
        this.currentPage = 1;
        this.getList(1);
        return;
      }
      // fallback: client-side filtering for other lists
      let list=this.tab==2?this.list:this.bookList;
      let showList=this.tab==2?this.showList:this.showBookList;
      showList.splice(0,showList.length,...list.filter(item=>{
        if(this.search.id && !((''+item.id).includes(this.search.id))) return false;
        if(this.search.taoRen&&item.taoRen!==this.search.taoRen)return false;
        if(this.search.bookUser&&item.bookUser!==this.search.bookUser)return false;
        if(this.search.channel&&item.channel!==this.search.channel)return false;
        if(this.search.name&&!item.name.includes(this.search.name))return false;
        if(this.search.phone&&!item.phone.includes(this.search.phone))return false;
        if(this.search.wechat&&!(item.wechat||'').includes(this.search.wechat))return false;
        if(this.search.doctor&&item.doctor!==this.search.doctor)return false;
        if(this.search.intent&&item.intent!==this.search.intent)return false;
        if(this.search.book&&item.book!==this.search.book)return false;
        if(this.search.visitStatus){
          const vs = item.visitStatus || '未回访';
          if(vs !== this.search.visitStatus) return false;
        }
        if(this.search.arrive&&item.arrive!==this.search.arrive)return false;
        if(this.search.startDate&&new Date(item.createTime)<new Date(this.search.startDate))return false;
        if(this.search.endDate&&new Date(item.createTime)>new Date(this.search.endDate+' 23:59:59'))return false;
        // 预约记录（tab==6）支持按到诊时间筛选：当设置了到诊开始/结束时，以到诊时间（优先使用 visitDate，最后回退到 createTime）进行过滤
        if(this.tab == 6){
          if(this.search.visitStart){
            const t = new Date(item.visitDate || item.createTime);
            const start = new Date(this.search.visitStart + 'T00:00:00');
            if(isNaN(t.getTime()) || t < start) return false;
          }
          if(this.search.visitEnd){
            const t = new Date(item.visitDate || item.createTime);
            const end = new Date(this.search.visitEnd + 'T23:59:59');
            if(isNaN(t.getTime()) || t > end) return false;
          }
        }
        return true;
      }));
    },
    resetSearch(){
      this.search={taoRen:"",bookUser:"",channel:"",name:"",phone:"",wechat:"",doctor:"",intent:"",book:"",visitStatus:"",arrive:"",startDate:"",endDate:"",visitStart:'',visitEnd:'',id:""};
    },
    resetPage(){
      this.currentPage=1;
      if(this.serverPaging){ this.getList(1); }
      else { this.totalPage=Math.ceil(this.showList.length/this.pageSize)||1; }
    },
    resetBookPage(){this.bookCurrentPage=1;this.bookTotalPage=Math.ceil(this.showBookList.length/this.bookPageSize)||1;},
    prevPage(){ if(this.currentPage>1){ this.currentPage--; if(this.serverPaging) this.getList(this.currentPage); } },
    nextPage(){ if(this.currentPage < this.totalPage){ this.currentPage++; if(this.serverPaging) this.getList(this.currentPage); } },
    prevBookPage(){if(this.bookCurrentPage>1)this.bookCurrentPage--;},
    nextBookPage(){if(this.bookCurrentPage<this.bookTotalPage)this.bookCurrentPage++;},
    async updateInfo(id,key,val,item){
      try{
        // 防御性检查：避免发送 undefined 值（常见于动态选项或绑定延迟）
        if(typeof val === 'undefined'){
          console.warn('updateInfo: value is undefined, aborting update', { id, key, item });
          this.showMsg('值未定义，更新已取消','error');
          return;
        }
        if(key==='show'){
          this.currentDetail=item;
          this.showDetail=true;
          const d=await this.apiCall("/api/visit/"+id);
          if(d.code===200)this.currentVisit=d.data;
          return;
        }
        // 调试日志：特别关注到诊时间修改请求
        if(key === 'visitDate'){
          console.debug('updateInfo: sending visitDate update', { id, val, user: this.user && this.user.role });
          this.showMsg('正在更新到诊时间...', 'info');
        }
        if(key === 'medicineDay'){
          console.debug('updateInfo: sending medicineDay update', { id, val, item });
          this.showMsg('正在更新开药天数...', 'info');
        }
        const data=await this.apiCall("/api/update",{
          method:"POST",
          body:JSON.stringify({id,key,val})
        });
        if(!data || data.code!==200){
          console.warn('updateInfo: update failed', { id, key, val, resp: data });
          this.showMsg((data && data.msg) ? data.msg : '更新失败','error');
          return;
        }
        if(key==='intent' && item){
          if(!item.firstConsultTime && val) item.firstConsultTime = new Date().toLocaleString();
          if(val && this.can('咨询')) item.visitStatus = '1访';
        }
        // 成功提示
        if(key === 'visitDate'){
          console.debug('updateInfo: visitDate updated successfully', { id, val });
        }
        this.showMsg('更新成功');
        // 仅获取并更新该条记录，保持在页面中的位置不变
        try{
          const updated = await this.fetchClueById(id);
            if(updated){ this.applyFetchedToLocal(updated); this.flashRow(updated.id); }
        }catch(e){ console.warn('fetch single clue after update failed', e); }
        if(key==='book'&&val==='已预约'){
          setTimeout(() => { this.updateInfo(id,'show',null,item); }, 500);
        }
      }catch(e){
        console.error('updateInfo exception', e);
        this.showMsg('更新发生错误，请查看控制台','error');
      }
    },
    async openDetail(item){
      try{
        console.log('openDetail called', item && item.id);
        this.currentDetail = item || {};
        this.detailEditing = false;
        this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
        // if there is already saved preCase, start in read-only mode; otherwise open editing
        try{ this.preCaseEditing = !(this.currentDetail.preCase && (''+this.currentDetail.preCase).trim() !== ''); }catch(e){ this.preCaseEditing = true; }
        this.preCaseDraft = this.currentDetail.preCase || '';
        // Clear transient revisit/edit state so content from previous detail doesn't leak
        this.revisitVisitContent = '';
        try{ this.revisitDraftId = null; }catch(e){}
        this.showDetail = true;
        // 拉取回访记录
        if(item && item.id){
          const d = await this.apiCall('/api/visit/' + item.id);
          if(d && d.code === 200){
            // sort visits ascending by time (oldest first)
            const list = (d.data || []).slice();
            list.sort((a,b)=>{ const ta = new Date(a && a.time ? a.time : 0).getTime(); const tb = new Date(b && b.time ? b.time : 0).getTime(); return ta - tb; });
            this.currentVisit = list;
          }else{
            this.currentVisit = [];
          }
          // 拉取图片
          try{
            const imgs = await this.apiCall('/api/clueImages?clueId=' + item.id);
            console.log('openDetail: fetched clueImages', item && item.id, imgs);
            if(imgs && imgs.code === 200){
              // attach to currentDetail (use Vue.set / this.$set to ensure reactivity in Vue2)
              const imgsList = imgs.data || [];
              try{
                if(this.$set) this.$set(this.currentDetail, 'images', imgsList);
                else if(typeof Vue !== 'undefined' && Vue.set) Vue.set(this.currentDetail, 'images', imgsList);
                else this.currentDetail.images = imgsList;
              }catch(e){ this.currentDetail.images = imgsList; }
              console.log('openDetail: set currentDetail.images', (this.currentDetail.images || []).map(x=>({id:x.id,key:x.key,thumbSmallKey:x.thumbSmallKey,thumbKey:x.thumbKey})));
            }else{
              try{ if(this.$set) this.$set(this.currentDetail, 'images', []); else if(typeof Vue !== 'undefined' && Vue.set) Vue.set(this.currentDetail, 'images', []); else this.currentDetail.images = []; }catch(e){ this.currentDetail.images = []; }
              console.log('openDetail: clueImages empty or error', imgs);
            }
            // refresh editable copy after images loaded
            this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
          }catch(e){ console.warn('fetch images failed', e); this.currentDetail.images = []; }
            // 开始轮询该线索的图片，以便别人上传的图片能够实时显示
          try{
            // 清理上一次的定时器
            if(this._clueImagesTimer) clearInterval(this._clueImagesTimer);

            // 定义一个用于比较图片列表（包含缩略图键）的辅助函数
            const _imagesSignature = (list) => JSON.stringify((list||[]).map(x => ({ k: (x.id||x.key||''), t: (x.thumbSmallKey||x.thumbKey||'') })));

            // 先设置一次性快速重试：如果缩略图尚未生成，短轮询更频繁地重试（每2s，最多5次）以便打开详情后能尽快显示别人的新图
            let quickRetries = 5;
            const quickInterval = 2000;
            const longInterval = 8000;

            const tryFetchAndUpdate = async () => {
              try{
                const imgs2 = await this.apiCall('/api/clueImages?clueId=' + item.id);
                console.log('tryFetchAndUpdate: fetched', item && item.id, imgs2);
                if(imgs2 && imgs2.code === 200){
                  const curList = (this.currentDetail && this.currentDetail.images) ? this.currentDetail.images : [];
                  const curSig = _imagesSignature(curList);
                  const nwSig = _imagesSignature(imgs2.data || []);
                  if(curSig !== nwSig){
                    console.log('tryFetchAndUpdate: images changed, updating currentDetail.images', { curSig, nwSig });
                    const imgsList2 = imgs2.data || [];
                    try{
                      if(this.$set) this.$set(this.currentDetail, 'images', imgsList2);
                      else if(typeof Vue !== 'undefined' && Vue.set) Vue.set(this.currentDetail, 'images', imgsList2);
                      else this.currentDetail.images = imgsList2;
                    }catch(e){ this.currentDetail.images = imgsList2; }
                    this.editDetail = JSON.parse(JSON.stringify(this.currentDetail || {}));
                    console.log('tryFetchAndUpdate: updated currentDetail.images count', (this.currentDetail.images||[]).length);
                  }
                  return imgs2.data || [];
                } else {
                  console.log('tryFetchAndUpdate: no images or error', imgs2);
                }
              }catch(e){ /* ignore polling errors */ }
              return null;
            };

            // 立即尝试一次
            tryFetchAndUpdate().then((initialList) => {
              // 如果当初返回的图片中有尚未生成缩略图的项（没有 thumbSmallKey/thumbKey），则启动快速轮询
              const needsThumb = (initialList || []).some(x => !(x && (x.thumbSmallKey || x.thumbKey)));
              if(needsThumb){
                // 快速轮询
                this._clueImagesTimer = setInterval(async () => {
                  try{
                    const list = await tryFetchAndUpdate();
                    quickRetries -= 1;
                    // 如果不再需要快速重试（所有图片已有缩略图），或重试次数耗尽，则切换到长轮询
                    const stillNeeds = (list || []).some(x => !(x && (x.thumbSmallKey || x.thumbKey)));
                    if(!stillNeeds || quickRetries <= 0){
                      clearInterval(this._clueImagesTimer);
                      this._clueImagesTimer = setInterval(async () => {
                        try{ await tryFetchAndUpdate(); }catch(e){}
                      }, longInterval);
                    }
                  }catch(e){ /* ignore */ }
                }, quickInterval);
              } else {
                // 直接进入长轮询
                this._clueImagesTimer = setInterval(async () => {
                  try{ await tryFetchAndUpdate(); }catch(e){}
                }, longInterval);
              }
            }).catch(() => {
              // 若初次尝试失败，也进入长轮询作为兜底
              this._clueImagesTimer = setInterval(async () => {
                try{ await tryFetchAndUpdate(); }catch(e){}
              }, longInterval);
            });
          }catch(e){ /* ignore timer setup errors */ }
        } else {
          this.currentVisit = [];
        }
        this.$nextTick(() => {
          if (this.$refs.visitModeSelect) {
            this.$refs.visitModeSelect.focus();
          }
        });
      }catch(e){
        console.error('openDetail error', e);
        this.showMsg('无法加载详情','error');
      }
      },
      // openAttachments 已移除 — 图片在详情模态内直接显示并在 openDetail 时加载
    closeDetail(){
      this.showDetail = false;
      this.currentDetail = {};
      this.currentVisit = [];
      this.revisitVisitContent = '';
      try{ this.revisitDraftId = null; }catch(e){}
      try{ if(this._clueImagesTimer){ clearInterval(this._clueImagesTimer); this._clueImagesTimer = null; } }catch(e){}
    },
    openEdit(item){
      this.editingId = item.id;
      this.editForm = {
        taoRen: item.taoRen || '',
        channel: item.channel || '',
        name: item.name || '',
        gender: item.gender || '',
        age: item.age || '',
        phone: item.phone || '',
        wechat: item.wechat || '',
        doctor: item.doctor || '',
        department: item.department || '',
        createTime: item.createTime || '',
        content: item.content || '',
        intent: item.intent || '',
        visitStatus: item.visitStatus || '',
        bookUser: item.bookUser || '',
        book: item.book || '',
        arrive: item.arrive || '',
        medicineDay: item.medicineDay || '',
        cost: item.cost || '',
        visitMode: item.visitMode || '',
        visitDate: item.visitDate || ''
      };
      this.showEditModal = true;
    },
    closeEdit(){
      this.showEditModal = false;
      this.editingId = null;
      this.editForm = {};
    },
    selectDocEdit(){
      const doc = this.doctorList.find(d => d.name === this.editForm.doctor);
      if(doc) this.editForm.department = doc.dept || '';
    },
    async saveEdit(){
      if(!this.editingId){
        this.showMsg('无效的线索ID','error');
        return;
      }
      if(!this.editForm.phone && !this.editForm.wechat){
        this.showMsg('电话或微信至少保留一个','error');
        return;
      }
      const updates = {
        taoRen: this.editForm.taoRen,
        channel: this.editForm.channel,
        name: this.editForm.name,
        gender: this.editForm.gender,
        age: this.editForm.age,
        phone: this.editForm.phone,
        wechat: this.editForm.wechat,
        doctor: this.editForm.doctor,
        department: this.editForm.department,
        createTime: this.editForm.createTime,
        content: this.editForm.content,
        intent: this.editForm.intent,
        bookUser: this.editForm.bookUser,
        book: this.editForm.book,
        arrive: this.editForm.arrive,
        medicineDay: this.editForm.medicineDay,
        cost: this.editForm.cost,
        visitMode: this.editForm.visitMode,
        visitDate: this.editForm.visitDate
      };
      // 防止非超级管理员无意提交 createTime 字段导致后端拒绝权限
      try{
        if(!(this.user && this.user.role === '超级管理员')){
          delete updates.createTime;
        }
      }catch(e){}
      this.isLoading = true;
      // 强制把 taoRen 设为当前登录用户名，前端不再允许修改套电人员管理
      try{ updates.taoRen = (this.user && this.user.username) || updates.taoRen; }catch(e){}
      // Ensure that if book was set to 已预约 during edit, and no bookUser provided, we set bookUser to current user
      try{ if(updates.book === '已预约' && (!updates.bookUser || updates.bookUser === '')) updates.bookUser = (this.user && this.user.username) || updates.bookUser; }catch(e){}
      const data = await this.apiCall('/api/updateClue', {
        method: 'POST',
        body: JSON.stringify({ id: this.editingId, updates })
      });
      this.isLoading = false;
      if(data.code === 200){
        this.showMsg('修改成功');
        const savedId = this.editingId;
        this.closeEdit();
        // 仅获取并更新该条记录，保持在页面中的位置不变
        try{
          const updated = await this.fetchClueById(savedId);
          if(updated){ this.applyFetchedToLocal(updated); this.flashRow(updated.id); }
        }catch(e){ console.warn('fetch single clue after saveEdit failed', e); }
      }
    },
    async openVisit(id){
      const content=prompt('请输入回访内容');
      if(!content)return;
      const data=await this.apiCall("/api/visit",{
        method:"POST",
        body:JSON.stringify({id,content,user:this.user.username})
      });
      if(data.code===200){
        this.showMsg('回访记录添加成功');
        // 添加回访后仅刷新该条记录并详情回访列表，保持行位置不变
        try{
          const updated = await this.fetchClueById(id);
          if(updated){ this.applyFetchedToLocal(updated); this.flashRow(updated.id); }
        }catch(e){ console.warn('fetch single clue after openVisit failed', e); }
        if(this.showDetail){
          const d=await this.apiCall("/api/visit/"+id);
          if(d.code===200)this.currentVisit=d.data;
        }
        // 刷新未回访统计
        try{ this.getUnvisitedCounts(); }catch(e){}
      }
    },

    async getUnvisitedCounts(){
      try{
        const d = await this.apiCall('/api/stats/unvisited');
        if(d && d.code === 200 && d.data){
          this.unvisitedTotal = d.data.totalUnvisited || 0;
          this.unvisitedToday = d.data.todayUnvisited || 0;
        }
      }catch(e){ console.warn('getUnvisitedCounts error', e); }
    },
    async delClue(id){
      if(!confirm('确定删除这条线索吗？'))return;
      const data=await this.apiCall("/api/del",{
        method:"POST",
        body:JSON.stringify({id})
      });
      if(data.code===200){
        this.showMsg('线索删除成功');
        this.getList();
        this.getBookList();
      }
    },
    async getUsers(){
      const d=await this.apiCall("/api/users");
      if(d && d.code===200){
        this.userList = d.data || [];
        // populate consultList so appointment-person dropdown can show options
        console.debug('getUsers: fetched users', this.userList);
        // include 咨询, 套电 and 主管 roles as appointment/book users
        this.consultList = (this.userList || []).filter(u => u && (u.role === '咨询' || u.role === '套电' || u.role === '主管'));
        // fallback: if still empty, include any user that has a username
        if(!this.consultList || this.consultList.length === 0){
          this.consultList = (this.userList || []).filter(u => u && u.username);
        }
        // keep existing assignTarget if set, otherwise pick first available account
        this.assignTarget = this.assignTarget || (this.consultList && this.consultList.length ? this.consultList[0].username : '');
      }
    },

    toggleSelectRow(id, ev){
      try{
        const checked = ev && ev.target ? !!ev.target.checked : !!ev;
        const idx = this.selectedIds.indexOf(id);
        if(checked){ if(idx===-1) this.selectedIds.push(id); }
        else { if(idx!==-1) this.selectedIds.splice(idx,1); }
        // update selectAllPage state
        const pids = (this.pageList||[]).map(x=>x.id);
        this.selectAllPage = pids.length>0 && pids.every(pid => this.selectedIds.indexOf(pid)!==-1);
      }catch(e){ console.warn('toggleSelectRow error', e); }
    },

    toggleSelectAllPage(){
      try{
        const pids = (this.pageList||[]).map(x=>x.id);
        if(this.selectAllPage){
          // add all page ids
          const s = new Set(this.selectedIds || []);
          pids.forEach(id=>s.add(id));
          this.selectedIds = Array.from(s);
        }else{
          // remove page ids
          this.selectedIds = (this.selectedIds || []).filter(id => pids.indexOf(id)===-1);
        }
      }catch(e){ console.warn('toggleSelectAllPage error', e); }
    },

    async openAssignModal(){
      // UX: show modal immediately to provide feedback, then load data
      try{ console.log && console.log('openAssignModal invoked, user:', this.user); }catch(e){}
      this.showAssignModal = true;
      // 强制确保模态显示（防止某些情况下 Vue class 绑定未反映到 DOM）
      try{ const _el = document.getElementById('assign-modal'); if(_el) _el.classList.add('show'); }catch(e){}
      try{ console.log('showAssignModal state after set:', this.showAssignModal); }catch(e){}
      this.assignLoading = true;
      try{
        // ensure we have user list
        if(!Array.isArray(this.userList) || this.userList.length===0) await this.getUsers();
        this.consultList = (this.userList || []).filter(u=>u && u.role === '咨询');
        this.assignTarget = this.consultList && this.consultList.length ? this.consultList[0].username : '';
        // update DOM placeholders in case Vue interpolation inside modal didn't render
        try{
          const sel = document.querySelector('#assign-modal .selected-count'); if(sel) sel.innerText = (this.selectedIds && this.selectedIds.length) ? this.selectedIds.length : 0;
          const fc = document.querySelector('#assign-modal .filtered-count'); if(fc) fc.innerText = this.filteredCount || 0;
          // populate select options as a fallback when Vue didn't render v-for
          const selectEl = document.getElementById('assign-target-select');
          if(selectEl){
            // preserve first placeholder option
            const placeholder = selectEl.querySelector('option[value=""]');
            selectEl.innerHTML = '';
            if(placeholder) selectEl.appendChild(placeholder);
            else { const opt = document.createElement('option'); opt.value = ''; opt.text = '请选择咨询账号'; selectEl.appendChild(opt); }
            (this.consultList||[]).forEach(u=>{ const o = document.createElement('option'); o.value = u.username; o.text = u.username + (u.name?('('+u.name+')'): ''); selectEl.appendChild(o); });
            // set value
            try{ selectEl.value = this.assignTarget || ''; }catch(e){}
          }
          const lbl = document.querySelector('#assign-submit-btn .assign-btn-label'); if(lbl) lbl.innerText = this.assignLoading ? '分配中...' : '确认分配';
        }catch(e){ console.warn('openAssignModal DOM fallback update failed', e); }
        // compute filtered count for current search (for info only)
        const payload = Object.assign({}, this.search || {}, { all: true });
        try{
          // avoid blocking UI if backend is slow: race request with a timeout
          const raceRes = await Promise.race([
            this.apiCall('/api/list', { method: 'POST', body: JSON.stringify(payload) }),
            new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3000))
          ]);
          if(raceRes && raceRes.timeout){
            // timed out -> fallback
            this.filteredCount = 0;
            console.warn('openAssignModal: filteredCount request timed out');
          } else if(raceRes && raceRes.code === 200){
            if(Array.isArray(raceRes.data)) this.filteredCount = raceRes.data.length;
            else if(raceRes.data && Array.isArray(raceRes.data.rows)) this.filteredCount = raceRes.data.rows.length;
            else this.filteredCount = 0;
          } else {
            this.filteredCount = 0;
          }
        }catch(e){ console.warn('openAssignModal: filteredCount fetch error', e); this.filteredCount = 0; }
      }catch(e){ console.error('openAssignModal error', e); this.showMsg('打开分配弹窗失败','error'); }
      finally{ this.assignLoading = false; }
    },

    closeAssignModal(){
      this.showAssignModal = false;
      this.assignScope = 'page';
      this.assignTarget = '';
      try{ const _el = document.getElementById('assign-modal'); if(_el) _el.classList.remove('show'); }catch(e){}
      this.assignNote = '';
      this.filteredCount = 0;
      this.consultList = [];
      this.assignLoading = false;
    },

    async submitAssign(){
      try{
        if(!this.assignTarget){ this.showMsg('请选择分配给的咨询账号','error'); return; }
        let body = { assignedTo: this.assignTarget, note: this.assignNote };
        if(this.assignScope === 'page'){
          if(!this.selectedIds || this.selectedIds.length===0){ this.showMsg('本页未选择任何线索','error'); return; }
          body.ids = this.selectedIds.slice();
        }else{
          body.filter = Object.assign({}, this.search || {});
          body.filter.all = true;
        }
        this.assignLoading = true;
        try{ const lbl = document.querySelector('#assign-submit-btn .assign-btn-label'); if(lbl) lbl.innerText = '分配中...'; }catch(e){}
        const res = await this.apiCall('/api/assignClues', { method: 'POST', body: JSON.stringify(body) });
        this.assignLoading = false;
        try{ const lbl = document.querySelector('#assign-submit-btn .assign-btn-label'); if(lbl) lbl.innerText = '确认分配'; }catch(e){}
        if(res && res.code === 200){
          const msg = `分配完成：已分配 ${res.data && res.data.assigned?res.data.assigned:0} 条，跳过 ${res.data && res.data.skipped?res.data.skipped:0} 条`;
          this.showMsg(msg);
          this.closeAssignModal();
          // refresh list
          this.getList(this.currentPage||1);
          // remove assigned ids from selectedIds
          try{
            if(body.ids && body.ids.length){ this.selectedIds = (this.selectedIds||[]).filter(id => body.ids.indexOf(id)===-1); }
          }catch(e){}
        }else{
          this.showMsg((res && res.msg) ? res.msg : '分配失败','error');
        }
      }catch(e){ this.assignLoading = false; console.error('submitAssign error', e); this.showMsg('分配异常','error'); }
    },

    // 当列表中选择预约状态变化时：如果变为 已预约，则同时把预约人员设置为当前登录账号
    async onBookChange(item){
      try{
        if(!item || !item.id) return;
        await this.updateInfo(item.id, 'book', item.book, item);
        if(item.book === '已预约'){
          // update bookUser to current username
          const uname = (this.user && this.user.username) || '';
          if(uname){
            // set locally for immediate UI feedback
            try{ item.bookUser = uname; }catch(e){}
            await this.updateInfo(item.id, 'bookUser', uname, item);
          }
        }else{
          // 当取消预约时，不改变 bookUser（保留历史）
        }
      }catch(e){ console.error('onBookChange error', e); }
    },
    async addUser(){
      if(!this.newUser||!this.newPwd){this.showMsg('请输入用户名和密码','error');return;}
      const data=await this.apiCall("/api/addUser",{
        method:"POST",
        body:JSON.stringify({username:this.newUser,password:this.newPwd,role:this.newRole})
      });
      if(data.code===200){
        this.showMsg('用户添加成功');
        this.newUser="";this.newPwd="";this.newRole="咨询";
        this.getUsers();
      }
    },
    async delUser(username){
      if(!confirm('确定删除用户 '+username+' 吗？'))return;
      const data=await this.apiCall("/api/delUser",{
        method:"POST",
        body:JSON.stringify({username})
      });
      if(data.code===200){
        this.showMsg('用户删除成功');
        this.getUsers();
      }
    },
    async changeUserPassword(username){
      try{
        const np = prompt('请输入 ' + username + ' 的新密码：');
        if(!np) return;
        this.isLoading = true;
        const res = await this.apiCall('/api/changeUserPassword', { method: 'POST', body: JSON.stringify({ username, newPassword: np }) });
        this.isLoading = false;
        if(res && res.code === 200){
          this.showMsg('密码修改成功');
        }else{
          this.showMsg((res && res.msg) ? res.msg : '修改失败','error');
        }
      }catch(e){ this.isLoading = false; console.error('changeUserPassword error', e); this.showMsg('修改失败','error'); }
    },
    async changeUserRole(username){
      try{
        const allowed = ['咨询','医助','主管','运营','套电','超级管理员'];
        let role = prompt('请输入新角色（可选：咨询,医助,主管,运营,套电,超级管理员）', '主管');
        if(!role) return;
        role = (role+'').trim();
        if(allowed.indexOf(role) === -1){ this.showMsg('非法角色','error'); return; }
        this.isLoading = true;
        const res = await this.apiCall('/api/updateUserRole', { method: 'POST', body: JSON.stringify({ username, role }) });
        this.isLoading = false;
        if(res && res.code === 200){ this.showMsg('角色修改成功'); this.getUsers(); }
        else{ this.showMsg((res && res.msg) ? res.msg : '修改失败','error'); }
      }catch(e){ this.isLoading = false; console.error('changeUserRole error', e); this.showMsg('修改失败','error'); }
    },
    async getDoctors(){
      const d=await this.apiCall("/api/doctors");
      if(d.code===200)this.doctorList=d.data;
    },
    async addDoctor(){
      if(!this.newDoc.name||!this.newDoc.dept){this.showMsg('请输入医生姓名和科室','error');return;}
      const payload = { name: this.newDoc.name, dept: this.newDoc.dept, operator: this.newDoc.operator };
      const data=await this.apiCall("/api/addDoctor",{
        method:"POST",
        body:JSON.stringify(payload)
      });
      if(data.code===200){
        this.showMsg('医生添加成功');
        this.newDoc={name:"",dept:"",operator:""};
        this.getDoctors();
      }
    },
    startEditDoctor(d){
      this.editingDoctor = { name: d.name, dept: d.dept || '', operator: d.operator || '' };
    },
    async saveDoctorEdit(){
      if(!this.editingDoctor || !this.editingDoctor.name) return;
      try{
        // 使用相对路径让请求走当前页面的同源代理/隧道，避免浏览器针对 loopback 的 Private Network 拦截
        const res = await this.apiCall('/api/updateDoctor',{ method: 'POST', body: JSON.stringify({ name: this.editingDoctor.name, dept: this.editingDoctor.dept, operator: this.editingDoctor.operator }) });
        if(res && res.code === 200){ this.showMsg('医生信息更新成功'); this.editingDoctor = null; this.getDoctors(); }
        else { this.showMsg('更新失败','error'); }
      }catch(e){ console.error('更新医生失败', e); this.showMsg('更新失败','error'); }
    },
    cancelEditDoctor(){ this.editingDoctor = null; },
    async delDoctor(name){
      if(!confirm('确定删除医生 '+name+' 吗？'))return;
      const data=await this.apiCall("/api/delDoctor",{
        method:"POST",
        body:JSON.stringify({name})
      });
      if(data.code===200){
        this.showMsg('医生删除成功');
        this.getDoctors();
      }
    },
    // 套电人员管理前端入口已移除；保留无害 stub 以避免旧事件引用错误
    async getTaoRen(){
      // no-op: taoRen 管理已移除，后端保留数据，仅供统计
      return;
    },
    async addTaoRen(){
      this.showMsg('套电人员管理已移除，无法新增','error');
    },
    async delTaoRen(name){
      this.showMsg('套电人员管理已移除，无法删除','error');
    },
    async getStatAll(){
      const month = this.selectedMonth || '';
      let url = month ? `/api/statAll?month=${encodeURIComponent(month)}` : '/api/statAll';
      // 若管理员开启了临时开关，传递参数给后端。后端会校验权限并仅在允许时应用该口径。
      if(this.statTreatUnvisitedAsRevisited){
        url += (url.indexOf('?') === -1 ? '?' : '&') + 'treatUnvisited=1';
      }
      const d=await this.apiCall(url);
      if(d.code===200){
        // enrich doctorStat: 保持预约相关列使用 docStat（recTime 口径），但线索统计相关列统一使用 monthGoalStat（createTime 口径）
        const rawDoc = d.data.docStat || [];
        const rawMG = d.data.monthGoalStat || [];
        this.doctorStat = rawDoc.map(it => {
          try{
            const mg = rawMG.find(x => x && x.name === it.name) || {};
            // take createTime-based fields from monthGoalStat if present
            const todayTotal = (mg.todayTotal !== undefined) ? Number(mg.todayTotal) || 0 : (Number(it.todayTotal) || 0);
            const todayValid = (mg.todayValid !== undefined) ? Number(mg.todayValid) || 0 : (Number(it.todayValid) || 0);
            const monthTotal = (mg.monthTotal !== undefined) ? Number(mg.monthTotal) || 0 : (Number(it.monthTotal) || 0);
            const monthValid = (mg.monthValid !== undefined) ? Number(mg.monthValid) || 0 : (Number(it.monthValid) || 0);
            const monthZhuanWei = (mg.monthZhuanWei !== undefined) ? Number(mg.monthZhuanWei) || 0 : (Number(it.monthZhuanWei) || 0);
            const monthValidRate = monthTotal ? ((monthValid / monthTotal) * 100).toFixed(1) + '%' : '0%';

            // appointment/arrive related keep from docStat (recTime-based)
            const monthBookInitial = Number(it.monthBookInitial) || 0;
            const monthBookRevisit = Number(it.monthBookRevisit) || 0;
            const monthBook = Number(it.monthBook) || 0;
            const monthBookPrev = Number(it.monthBookPrev) || 0;
            const monthBookRate = it.monthBookRate || '0%';
            const monthArrive = Number(it.monthArrive) || 0;
            const monthArriveRate = it.monthArriveRate || '0%';
            const monthOnlineArrive = Number(it.monthOnlineArrive) || 0;
            const monthOfflineArrive = Number(it.monthOfflineArrive) || 0;

            return Object.assign({}, it, {
              todayTotal, todayValid, monthTotal, monthValid, monthZhuanWei, monthValidRate,
              monthBookInitial, monthBookRevisit, monthBook, monthBookPrev, monthBookRate, monthArrive, monthArriveRate, monthOnlineArrive, monthOfflineArrive
            });
          }catch(e){ return it; }
        });
        this.taoStat=d.data.taoStat;
        this.bookUserStat = d.data.bookUserStat || {};
        this.monthGoalStat = d.data.monthGoalStat || [];
        this.monthGoalDayTotals = d.data.monthGoalDayTotals || null;
        this.drugCostStat = d.data.drugCostStat || [];
        this.medicineDayScheme = d.data.medicineDayScheme || 'legacy';
        this.personnelTotals = d.data.personnelTotals || null;
        this.personnelChannelBreakdown = d.data.personnelChannelBreakdown || null;
        // 调试输出：对比 docStat 与 monthGoalStat（方便定位条目差异）——仅在控制台打印，不影响 UI
        try{
          const nameToCheck = '赵京伟';
          const rawDocStat = d.data.docStat || [];
          const rawMonthGoal = d.data.monthGoalStat || [];
          const docEntry = rawDocStat.find(x => x && x.name === nameToCheck);
          const mgEntry = rawMonthGoal.find(x => x && x.name === nameToCheck);
          if(docEntry || mgEntry){
            console.group && console.group(`statAll-debug:${nameToCheck}@${this.selectedMonth}`);
            console.log('docStat entry ->', docEntry);
            console.log('monthGoalStat entry ->', mgEntry);
            try{
              const docMonthValid = docEntry ? (Number(docEntry.monthValid) || 0) : 0;
              const mgDaySum = mgEntry && Array.isArray(mgEntry.dayCounts) ? mgEntry.dayCounts.reduce((a,b)=>a + (Number(b)||0), 0) : 0;
              console.log('doc.monthValid =', docMonthValid, ', monthGoal dayCounts sum =', mgDaySum, ', difference =', docMonthValid - mgDaySum);
            }catch(e){ console.warn('calc diff failed', e); }
            console.groupEnd && console.groupEnd();
          }
        }catch(e){ console.warn('statAll debug logging failed', e); }
        // 优先使用后端直接返回的 personnelStat（若存在），否则根据 taoStat 与 bookUserStat 在前端构建
        const incomingPersonnel = d.data.personnelStat;
        if(Array.isArray(incomingPersonnel) && incomingPersonnel.length > 0){
          this.personnelStat = incomingPersonnel.map(p => {
            const b = (this.bookUserStat && this.bookUserStat[p.name]) ? this.bookUserStat[p.name] : null;
            return Object.assign({}, p, {
              todayBook: b ? (b.todayBook || 0) : 0,
              monthBook: b ? (b.monthBookCount || 0) : 0
            });
          });
        }else{
          // 若后端未返回 personnelStat，则以 taoStat（只含 taoRen）为基础构建列表，预约字段从 bookUserStat 补齐
          const arr = (d.data.taoStat || []).map(t => {
            const b = (this.bookUserStat && this.bookUserStat[t.name]) ? this.bookUserStat[t.name] : {};
            return {
              name: t.name,
              todayTotal: t.todayTotal || 0,
              todayValid: t.todayValid || 0,
              monthTotal: t.monthTotal || 0,
              monthValid: t.monthValid || 0,
              todayBook: b.todayBook || 0,
              monthBook: b.monthBookCount || 0
            };
          });
          this.personnelStat = arr;
        }
      }
    },

    showChannelBreakdown(type, e){
      try{
        // cancel pending hide
        this.clearHideChannelTimer();
        if(!this.personnelChannelBreakdown || !this.personnelChannelBreakdown[type]){
          this.channelPopupItems = [];
        }else{
          const map = this.personnelChannelBreakdown[type] || {};
          const arr = Object.keys(map).map(k=>({channel:k,count:map[k]})).sort((a,b)=>b.count - a.count);
          this.channelPopupItems = arr;
        }
        // position: prefer to show to the right of target
        const rect = e.target.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
        this.channelPopupX = Math.round(rect.right + 8 + scrollX);
        this.channelPopupY = Math.round(rect.top + scrollY - 6);
        this.showChannelPopup = true;
      }catch(err){ console.error('showChannelBreakdown error', err); this.showChannelPopup = false }
    },
    showDoctorDayChannel(item, idx, e){
      try{
        this.clearHideChannelTimer();
        const chArr = (item && item.dayChannels && item.dayChannels[idx]) ? item.dayChannels[idx] : null;
        if(!chArr){ this.channelPopupItems = []; }
        else{
          const arr = Object.keys(chArr).map(k=>({channel:k,count:chArr[k]})).sort((a,b)=>b.count - a.count);
          this.channelPopupItems = arr;
        }
        const rect = e.target.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
        this.channelPopupX = Math.round(rect.right + 8 + scrollX);
        this.channelPopupY = Math.round(rect.top + scrollY - 6);
        this.showChannelPopup = true;
      }catch(err){ console.error('showDoctorDayChannel error', err); this.showChannelPopup = false }
    },
    startHideChannelBreakdownTimer(){
      this.clearHideChannelTimer();
      this.hideChannelTimer = setTimeout(()=>{ this.showChannelPopup = false; this.hideChannelTimer = null; }, 220);
    },
    clearHideChannelTimer(){ if(this.hideChannelTimer){ clearTimeout(this.hideChannelTimer); this.hideChannelTimer = null; } },
    formatNumber(v){
      if(v === null || v === undefined || v === '') return '0';
      const n = Number(v);
      if(!Number.isFinite(n)) return v;
      return n.toLocaleString();
    },
    formatRate(v){
      if(v === null || v === undefined || v === '') return '0%';
      // if already a string with % return as-is
      if(typeof v === 'string' && v.indexOf('%') !== -1) return v;
      const n = Number(v);
      if(!Number.isFinite(n)) return v;
      return n.toFixed(1) + '%';
    },
    // 统计辅助：对数组中某个字段求和（忽略不可转为数的项）
    sumField(list, key){
      if(!Array.isArray(list) || list.length===0) return 0;
      let s = 0;
      for(const it of list){
        try{
          let v = it && (it[key] || it[key] === 0) ? it[key] : null;
          if(v === null || v === undefined || v === '') continue;
          if(typeof v === 'string') v = v.replace(/,/g,'').replace('%','');
          const n = Number(v);
          if(Number.isFinite(n)) s += n;
        }catch(e){continue}
      }
      return s;
    },
      // 计算单个医生/行的 dayCounts 数组之和（用于前端按每日有效线索相加得出月总计）
      sumDayCounts(arr){
        if(!Array.isArray(arr) || arr.length===0) return 0;
        let s = 0;
        for(const v of arr){
          try{ const n = Number(v); if(Number.isFinite(n)) s += n; }catch(e){ continue }
        }
        return s;
      },
      // 计算运营目标表格的月总计（优先使用后端逐日总计，否则按每行 dayCounts 汇总）
      sumMonthGoalTotals(){
        if(Array.isArray(this.monthGoalDayTotals) && this.monthGoalDayTotals.length>0){
          return this.monthGoalDayTotals.reduce((a,b)=> a + (Number(b)||0), 0);
        }
        if(!Array.isArray(this.monthGoalStat) || this.monthGoalStat.length===0) return 0;
        let s = 0;
        for(const it of this.monthGoalStat){
          s += this.sumDayCounts(it.dayCounts || []);
        }
        return s;
      },
    // 平均百分比：对可能是字符串或数字的百分比字段取平均并返回格式化字符串（带 %）
    avgPercentField(list, key){
      if(!Array.isArray(list) || list.length===0) return this.formatRate(0);
      let sum = 0; let cnt = 0;
      for(const it of list){
        try{
          let v = it && (it[key] || it[key] === 0) ? it[key] : null;
          if(v === null || v === undefined || v === '') continue;
          if(typeof v === 'string' && v.indexOf('%') !== -1){ v = v.replace('%',''); }
          const n = Number((''+v).replace(/,/g,''));
          if(Number.isFinite(n)){ sum += n; cnt++; }
        }catch(e){ continue }
      }
      if(cnt === 0) return this.formatRate(0);
      return this.formatRate(sum / cnt);
    },
    // monthGoal 专用：按天列求和，idx 从 0 开始
    sumMonthGoalDay(idx){
      // 优先使用后端预计算的逐日总计（避免前端和后端口径或重复计数差异）
      if(Array.isArray(this.monthGoalDayTotals) && this.monthGoalDayTotals.length > idx) {
        const v = Number(this.monthGoalDayTotals[idx]) || 0; return v;
      }
      if(!Array.isArray(this.monthGoalStat) || this.monthGoalStat.length===0) return 0;
      let s = 0;
      for(const it of this.monthGoalStat){
        try{
          const arr = it.dayCounts || [];
          const v = arr && arr.length > idx ? arr[idx] : 0;
          const n = Number(v);
          if(Number.isFinite(n)) s += n;
        }catch(e){ continue }
      }
      return s;
    },
    // 求数组中某字段的平均值（忽略空值）
    avgField(list, key){
      if(!Array.isArray(list) || list.length===0) return 0;
      let s = 0; let cnt = 0;
      for(const it of list){
        try{
          let v = it && (it[key] || it[key] === 0) ? it[key] : null;
          if(v === null || v === undefined || v === '') continue;
          if(typeof v === 'string') v = v.replace(/,/g,'').replace('%','');
          const n = Number(v);
          if(Number.isFinite(n)){ s += n; cnt++; }
        }catch(e){ continue }
      }
      if(cnt === 0) return 0;
      return s / cnt;
    },
    // 药费统计中按 medicineCounts 的指定键求和
    sumMedicineCount(key){
      if(!Array.isArray(this.drugCostStat) || this.drugCostStat.length===0) return 0;
      let s = 0;
      for(const it of this.drugCostStat){
        try{
          const counts = it.medicineCounts || {};
          const v = counts && counts[key] ? counts[key] : 0;
          const n = Number(v);
          if(Number.isFinite(n)) s += n;
        }catch(e){ continue }
      }
      return s;
    },
    // 从后端获取单条线索（按 id）并返回该对象或 null
    async fetchClueById(id){
      try{
        const d = await this.apiCall('/api/list', { method: 'POST', body: JSON.stringify({ id }) });
        if(d && d.code === 200){
          if(Array.isArray(d.data) && d.data.length>0) return d.data[0];
        }
      }catch(e){ console.error('fetchClueById error', e); }
      return null;
    },
    // 将后端返回的单条记录原地应用到当前显示的列表中（不改变顺序），用于保存后保持行位置
    applyFetchedToLocal(item){
      if(!item || !item.id) return;
      const applyToArray = (arr)=>{
        if(!Array.isArray(arr)) return;
        for(let i=0;i<arr.length;i++){
          if(arr[i] && (''+arr[i].id) === (''+item.id)){
            // 保持原对象引用以避免重新排序或重绘位置，更新字段
            Object.keys(item).forEach(k=>{ arr[i][k] = item[k]; });
            return true;
          }
        }
        return false;
      };
      // Update displayed arrays first to keep visible position
      applyToArray(this.showList);
      applyToArray(this.showBookList);
      applyToArray(this.revisitShowList);
      // Also update master lists to keep data consistent
      applyToArray(this.list);
      applyToArray(this.bookList);
      applyToArray(this.revisitList);
    },
    // 高亮指定行（保存成功后使用）
    flashRow(id){
      if(!id) return;
      this.highlightedId = id;
      setTimeout(()=>{ if(this.highlightedId===id) this.highlightedId = null; }, 2000);
    },
    // 导入导出相关方法
    showImportDialog(){
      this.showImportModal = true;
      this.selectedFileName = "";
      this.previewData = [];
    },
    hideImportDialog(){
      this.showImportModal = false;
      this.selectedFileName = "";
      this.previewData = [];
      if(this.$refs.importFileInput) this.$refs.importFileInput.value = "";
    },
    showExportDialog(){
      this.showExportModal = true;
    },
    hideExportDialog(){
      this.showExportModal = false;
    },
    downloadTemplate(){
      // 下载完整Excel导入模板（包含示例和字段说明）
        const headers = [
        'taoRen(套电人员)', 'channel(渠道)', 'name(客户姓名)', 'gender(性别)', 'age(年龄)', 'phone(电话)', 'wechat(微信)', 'doctor(医生)', 'department(科室)', 'content(咨询备注)',
        'intent(意向)', 'visitStatus(回访状态)', 'bookUser(预约人员)', 'book(预约状态)', 'firstConsultTime(首咨时间 YYYY-MM-DD HH:mm:ss)',
        'arrive(到诊状态)', 'medicineDay(开药天数)', 'cost(药费)', 'visitMode(就诊方式)', 'visitDate(到诊日期 YYYY-MM-DD)', 'createTime(创建时间 YYYY-MM-DD HH:mm:ss)', 'username(来源用户 可选)'
      ];

      const example = [
        '赵舒杭','抖音','张三','男','28','13800138000','wx123456','赵京伟','整形科','初诊咨询','有效','1访','李小明','已预约','2026-05-10 09:00:00','已到诊','14天以下','1200','线下','2026-05-20','2026-05-10 09:00:00','upload_user'
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      // 列宽设置
      ws['!cols'] = new Array(headers.length).fill(0).map((_,i)=>({wch: i===9?30:16}));

      // 字段说明工作表（简短）
      const desc = [
        ['字段', '说明', '示例/格式'],
        ['taoRen', '套电人员名称，字符串', '赵舒杭'],
        ['channel', '渠道名称，字符串', '抖音'],
        ['name', '客户姓名，必填', '张三'],
        ['gender', '性别，男/女/空', '男'],
        ['age', '年龄，整数或空', '28'],
        ['phone', '电话或空（与 wechat 二选一）', '13800138000'],
        ['wechat', '微信或空（与 phone 二选一）', 'wx123456'],
        ['doctor', '医生姓名', '赵京伟'],
        ['department', '科室', '整形科'],
        ['content', '咨询备注', '初诊咨询...'],
        ['intent', '意向，如 有效/无效/待定', '有效'],
        ['visitStatus', '回访状态，如 未回访/1访/2访/3访', '未回访'],
        ['bookUser', '预约人员', '李小明'],
        ['book', '预约状态：已预约/未预约', '已预约'],
        // note: bookTime 已废弃，使用 visitDate 作为到诊时间口径；若导入表包含预约发生时间，请放到 visitDate 列
        ['firstConsultTime', '首咨时间，格式 YYYY-MM-DD HH:mm:ss 或空', '2026-05-10 09:00:00'],
        ['arrive', '到诊：已到诊/未到诊', '已到诊'],
        ['medicineDay', '开药天数分组：14天以下 / 14-21天 / 22-28天 / 28天以上 / 未开药 / 未支付', '14天以下'],
        ['cost', '药费，数字', '1200'],
        ['visitMode', '就诊方式：线上/线下', '线下'],
        ['visitDate', '到诊日期 YYYY-MM-DD', '2026-05-20'],
        ['createTime', '创建时间，可空，格式 YYYY-MM-DD HH:mm:ss', '2026-05-10 09:00:00'],
        ['username', '记录来源用户（仅管理员可覆盖），可空', 'upload_user']
      ];
      const wsDesc = XLSX.utils.aoa_to_sheet(desc);

      XLSX.utils.book_append_sheet(wb, ws, '导入模板');
      XLSX.utils.book_append_sheet(wb, wsDesc, '字段说明');
      XLSX.writeFile(wb, '线索导入完整模板.xlsx');
    },
    handleFileSelect(event){
      const file = event.target.files[0];
      if(!file) return;
      
      this.selectedFileName = file.name;
      
      // 预览数据
      const reader = new FileReader();
      reader.onload = (e) => {
        try{
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, {type: 'array'});
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          // 解析第一行作为表头，支持中文或英文字段名
          const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1, blankrows: false});
          if(!rows || rows.length < 1) throw new Error('空表格');
          const headerRow = rows[0].map(h => (''+h).trim());

          // 映射表头到字段名（支持中文表头或包含字段名的括号）
          const headerMap = {};
          headerRow.forEach((h, idx) => {
            const low = h.toLowerCase();
            // 常见中文到字段的映射
            if(/name|客户姓名|姓名/.test(low)) headerMap[idx] = 'name';
            else if(/taoren|套电人员/.test(low)) headerMap[idx] = 'taoRen';
            else if(/channel|渠道/.test(low)) headerMap[idx] = 'channel';
            else if(/gender|性别/.test(low)) headerMap[idx] = 'gender';
            else if(/age|年龄/.test(low)) headerMap[idx] = 'age';
            else if(/phone|电话/.test(low)) headerMap[idx] = 'phone';
            else if(/wechat|微信/.test(low)) headerMap[idx] = 'wechat';
            else if(/doctor|医生/.test(low)) headerMap[idx] = 'doctor';
            else if(/department|科室/.test(low)) headerMap[idx] = 'department';
            else if(/content|咨询备注|备注/.test(low)) headerMap[idx] = 'content';
            else if(/intent|意向/.test(low)) headerMap[idx] = 'intent';
            else if(/visitstatus|回访状态/.test(low)) headerMap[idx] = 'visitStatus';
            else if(/bookuser|预约人员/.test(low)) headerMap[idx] = 'bookUser';
            else if(/book(\(|预约状态)|预约/.test(low)) headerMap[idx] = 'book';
            else if(/booktime|预约发生时间/.test(low)) headerMap[idx] = 'visitDate';
            else if(/firstconsulttime|首咨/.test(low)) headerMap[idx] = 'firstConsultTime';
            else if(/arrive|到诊|到院/.test(low)) headerMap[idx] = 'arrive';
            else if(/medicineday|开药天数/.test(low)) headerMap[idx] = 'medicineDay';
            else if(/cost|药费/.test(low)) headerMap[idx] = 'cost';
            else if(/visitmode|就诊方式/.test(low)) headerMap[idx] = 'visitMode';
            else if(/visitdate|到诊日期|就诊日期/.test(low)) headerMap[idx] = 'visitDate';
            else if(/createtime|创建时间/.test(low)) headerMap[idx] = 'createTime';
            else if(/username/.test(low)) headerMap[idx] = 'username';
            else headerMap[idx] = null;
          });

          const preview = [];
          for(let r = 1; r < rows.length; r++){
            const row = rows[r];
            if(!row || row.length === 0) continue;
            const obj = {};
            for(let c = 0; c < row.length; c++){
              const key = headerMap[c];
              if(!key) continue;
              obj[key] = row[c] !== undefined && row[c] !== null ? String(row[c]).trim() : '';
            }
            // 只保留满足以下条件的行用于预览并导入：
            // - 电话或微信任一有值
            // - 医生（doctor）必须有内容
            // - 渠道（channel）必须有内容
            // - 线索创建时间（createTime）必须有内容
            if ((obj.phone || obj.wechat) && obj.doctor && obj.channel && obj.createTime) preview.push(obj);
          }
          this.previewData = preview;
          
        }catch(err){
          console.error('预览错误:', err);
          this.showMsg('文件格式错误，请检查文件','error');
          this.selectedFileName = "";
          this.previewData = [];
        }
      };
      reader.readAsArrayBuffer(file);
    },
    async confirmImport(){
      if(!this.selectedFileName || this.previewData.length === 0){
        this.showMsg('请先选择有效的Excel文件','error');
        return;
      }
      
      this.isImporting = true;
      try{
        // First call preview API to detect conflicts (fields that would be overwritten or filled)
        const pv = await this.apiCall('/api/importPreview', { method: 'POST', body: JSON.stringify({ clues: this.previewData }) });
        if(pv && pv.code === 200){
          const conflicts = pv.data && pv.data.conflicts ? pv.data.conflicts : [];
          if(conflicts.length > 0){
            // show conflict modal for user confirmation
            this.importConflicts = conflicts;
            this.showImportConflictModal = true;
            this.isImporting = false;
            return;
          }
        }
        // no conflicts, proceed to import directly
        const result = await this.apiCall("/api/importClues", {
          method: "POST",
          body: JSON.stringify({clues: this.previewData, confirm: true})
        });
        if(result.code === 200){
          this.showMsg(`成功导入 ${result.data.imported} 条数据`);
          this.hideImportDialog();
          this.getList();
          this.getBookList();
        }
      }catch(err){
        console.error('导入错误:', err);
        this.showMsg('导入失败','error');
      }finally{
        this.isImporting = false;
      }
    },

    // User confirmed in conflict modal -> proceed import with confirmation
    async proceedImportAfterPreview(){
      this.showImportConflictModal = false;
      this.isImporting = true;
      try{
        const result = await this.apiCall('/api/importClues', { method: 'POST', body: JSON.stringify({ clues: this.previewData, confirm: true }) });
        if(result && result.code === 200){
          this.showMsg(`成功导入 ${result.data.imported} 条数据`);
          this.hideImportDialog();
          this.getList();
          this.getBookList();
        }
      }catch(e){ console.error('导入错误:', e); this.showMsg('导入失败','error'); }
      finally{ this.isImporting = false; }
    },
    cancelImportPreview(){ this.showImportConflictModal = false; this.importConflicts = []; },
    async confirmExport(){
      if(!this.exportStartDate || !this.exportEndDate){
        this.showMsg('请选择导出日期范围','error');
        return;
      }
      
      this.isExporting = true;
      try{
        await this.exportData();
        this.hideExportDialog();
      }catch(err){
        console.error('导出错误:', err);
        this.showMsg('导出失败','error');
      }finally{
        this.isExporting = false;
      }
    },
    async exportByVisitDate(){
      if(!this.exportVisitDate){ this.showMsg('请选择要导出的到诊日期','error'); return; }
      const date = this.exportVisitDate;
      this.isExporting = true;
      try{
        const token = this.getAuth();
        const isRemote = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.hostname !== '::1' && window.location.protocol !== 'file:';
        let baseUrl;
        if (window.location.protocol === 'file:' || window.location.protocol === 'null') baseUrl = 'http://localhost:3000';
        else if (isRemote) baseUrl = window.location.origin;
        else baseUrl = 'http://localhost:3000';
        const url = `${baseUrl}/api/exportByVisitDate?date=${encodeURIComponent(date)}`;
        const headers = token ? { Authorization: 'Bearer ' + token } : {};
        const resp = await fetch(url, { method: 'GET', headers, mode: 'cors', targetAddressSpace: 'local' });
        if(!resp.ok){ this.showMsg('导出失败：服务器返回错误','error'); this.isExporting = false; return; }
        const blob = await resp.blob();
        const filename = `到诊_${date}.xlsx`;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(()=>{ URL.revokeObjectURL(link.href); try{ document.body.removeChild(link); }catch(e){} }, 1500);
        this.showMsg('导出已开始');
      }catch(e){ console.error('exportByVisitDate error', e); this.showMsg('导出失败','error'); }
      finally{ this.isExporting = false; }
    },
    async exportData(){
      try{
        const data = await this.apiCall("/api/exportClues", {
          method: "POST",
          body: JSON.stringify({ startDate: this.exportStartDate, endDate: this.exportEndDate, doctor: this.exportDoctor })
        });

        if(data.code === 200){
          // 后端返回 { clues: [...], visits: [...] }
          const payload = data.data || {};
          const clues = payload.clues || [];
          const visits = payload.visits || [];

          // 只导出用户要求的字段：姓名-性别-年龄-电话-就诊方式-回访记录-到诊时间
          const headers = ['姓名','性别','年龄','电话','就诊方式','回访记录','到诊时间'];

          // 将 visits 按 clueId 分组
          const visitsByClue = {};
          for(const v of visits){
            const id = v.clueId;
            if(!visitsByClue[id]) visitsByClue[id] = [];
            visitsByClue[id].push(v);
          }

          // 格式化导出数据
          const exportData = clues.map(item => {
            const vlist = visitsByClue[item.id] || [];
            // 回访按时间降序拼接，每条换行显示
            const merged = vlist.map(v => ((v.content||'')+ '').replace(/[\r\n]+/g,' ').trim()).filter(s=>s).join(' ; ');
            // 到诊时间优先使用 visitDate，最后回退到 createTime
            const visitTime = item.visitDate || item.createTime || '';
            return [
              item.name || '',
              item.gender || '',
              item.age || '',
              item.phone || '',
              item.visitMode || '',
              merged || '',
              visitTime || ''
            ];
          });

          // 回访明细表（每行一条回访）
          const visitHeaders = ['线索姓名','线索ID','回访时间','回访人员','回访内容'];
          const visitRows = [];
          for(const v of visits){
            const clue = (clues.find(c=>c.id === v.clueId) || {});
            visitRows.push([clue.name || '', v.clueId || '', v.time || '', v.user || '', v.content || '']);
          }

          const wb = XLSX.utils.book_new();
          const ws1 = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
          ws1['!cols'] = [{wch:12},{wch:6},{wch:8},{wch:14},{wch:12},{wch:40},{wch:18}];
          XLSX.utils.book_append_sheet(wb, ws1, '线索数据');

          const ws2 = XLSX.utils.aoa_to_sheet([visitHeaders, ...visitRows]);
          ws2['!cols'] = [{wch:12},{wch:8},{wch:18},{wch:12},{wch:40}];
          XLSX.utils.book_append_sheet(wb, ws2, '回访明细');

          XLSX.writeFile(wb, `预约线索_${this.exportStartDate}_${this.exportEndDate}.xlsx`);
          this.showMsg('导出成功');
        }
        
      }catch(err){
        console.error('导出错误:', err);
        throw err;
      }
    },

    async savePreCase(){
      if(!this.currentDetail || !this.currentDetail.id) { this.showMsg('无效的详情记录','error'); return; }
      try{
        this.isLoading = true;
        await this.updateInfo(this.currentDetail.id, 'preCase', this.preCaseDraft);
        // updateInfo will fetch and apply the updated record; sync local draft
        // ensure currentDetail reflects saved value and exit edit mode
        this.preCaseDraft = this.currentDetail.preCase || this.preCaseDraft || '';
        try{ this.currentDetail.preCase = this.preCaseDraft; }catch(e){}
        this.preCaseEditing = false;
        this.showMsg('诊前病例已保存');
      }catch(e){ console.error('savePreCase error', e); this.showMsg('保存失败','error'); }
      finally{ this.isLoading = false; }
    },

    cancelPreCaseEdit(){
      // discard draft and return to read-only
      try{ this.preCaseDraft = this.currentDetail.preCase || ''; }catch(e){ this.preCaseDraft = ''; }
      this.preCaseEditing = false;
    },

    async uploadRevisitImage(e){
      try{
        const files = (e && e.target && e.target.files) ? Array.from(e.target.files) : [];
        if(!files || files.length === 0) return;
        if(!this.currentDetail || !this.currentDetail.id){ this.showMsg('请先打开详情再上传','error'); return; }
        const file = files[0];
        this.revisitUploading = true;
        const form = new FormData();
        form.append('image', file, file.name || 'upload.jpg');
        const token = this.getAuth();
        const base = (window.location.protocol === 'file:' ? 'http://localhost:3000' : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin));
        const url = `${base}/api/uploadImage?clueId=${encodeURIComponent(this.currentDetail.id)}`;
        const res = await fetch(url, { method: 'POST', body: form, headers: token ? { Authorization: 'Bearer ' + token } : {} , mode: 'cors', targetAddressSpace: 'local' });
        const text = await res.text();
        let data;
        try{ data = JSON.parse(text); }catch(err){ throw new Error('服务器返回非 JSON'); }
        if(data && data.code === 200 && data.data){
          // append to currentDetail.images for immediate visibility
          this.currentDetail.images = this.currentDetail.images || [];
          this.currentDetail.images.push(data.data);
          this.showMsg('图片已上传');
        }else{
          console.warn('uploadRevisitImage failed', data);
          this.showMsg('上传失败','error');
        }
      }catch(err){ console.error('uploadRevisitImage error', err); this.showMsg('上传失败','error'); }
      finally{ this.revisitUploading = false; try{ if(e && e.target) e.target.value = ''; }catch(_){} }
    }
  }
});
