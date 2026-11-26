(() => {
  'use strict';
  const STORE_KEY = 'marafe-game-state-v1';
  const START_STATE = { day: '2026-03-01', treasury: 12.4, population: 8.2, stability: 72, economy: 64, paused: false, speed: 1, roadProjects: 0, welfarePrograms: 0, clinicProjects: 0, notices: 0 };
  const titles = { overview: 'نظرة عامة', government: 'الحكومة', economy: 'الاقتصاد', population: 'السكان', infrastructure: 'البنية التحتية', map: 'الخريطة الوطنية', notifications: 'الأحداث والتنبيهات', reports: 'الإحصاءات والتقارير' };
  let state = loadState();
  let setupStep = 0;
  let setupMode = 'real';
  const setup = { mode: 'real', setupType: 'real', country: 'المملكة الأردنية الهاشمية', countryEn: 'Jordan', capital: 'عمّان', population: 11.2, currency: 'دينار أردني', symbol: 'د.أ', government: 'ملكية دستورية', administration: 'لامركزية', leader: 'رئيس الحكومة', language: 'العربية', development: 'متوسط', treasury: 18, debt: 35, resources: 'معدنية وصناعية', quick: true, worldName: 'عالم مرافئ' };
  let activeSection = 'overview';
  let dayProgress = 0;
  let lastFrame = Date.now();
  let toastTimer;
  let rotation = 0;
  const byId = id => document.getElementById(id);
  const format = (num, digits = 0) => new Intl.NumberFormat('ar', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(num);
  const dayDate = () => new Date(`${state.day}T12:00:00Z`);
  const numberOfDays = () => Math.floor((dayDate() - new Date('2026-03-01T12:00:00Z')) / 86400000);
  const dateText = () => new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(dayDate());
  const weekdayText = () => `${new Intl.DateTimeFormat('ar', { weekday: 'long', timeZone: 'UTC' }).format(dayDate())} · ${state.day.slice(5, 7) === '03' ? 'الربيع المبكر' : 'فصل الربيع'}`;
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved === 'object') return { ...START_STATE, ...saved, paused: Boolean(saved.paused), speed: [1, 2, 4].includes(saved.speed) ? saved.speed : 1 };
    } catch (error) { console.info('تعذّر قراءة الحفظ المحلي؛ سيبدأ عالم جديد.'); }
    return { ...START_STATE };
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (error) { /* التشغيل مستمر حتى إن كان التخزين غير متاح */ }
  }
  function economyLabel() {
    if (state.economy >= 78) return 'مزدهر';
    if (state.economy >= 58) return 'مستقر';
    if (state.economy >= 38) return 'متباطئ';
    return 'منكمش';
  }
  function dailyIncome() { return Math.max(8, 18.6 + (state.economy - 64) * 0.22 + (state.population - 8.2) * 0.45); }
  function dailySpending() { return 9.2 + state.roadProjects * 0.22 + state.welfarePrograms * 0.1 + state.clinicProjects * 0.14; }
  function renderMetrics() {
    byId('date-label').textContent = dateText();
    byId('day-label').textContent = weekdayText();
    byId('treasury-value').innerHTML = `${format(state.treasury, 1)} <small>مليار</small>`;
    byId('income-value').textContent = `+${format(dailyIncome(), 1)} م`;
    byId('treasury-trend').textContent = dailyIncome() >= dailySpending() ? '↑' : '↓';
    byId('treasury-trend').className = `trend ${dailyIncome() >= dailySpending() ? 'up' : 'steady'}`;
    byId('population-value').innerHTML = `${format(state.population, 1)} <small>مليون</small>`;
    byId('stability-value').innerHTML = `${format(state.stability)}<small>٪</small>`;
    byId('stability-meter').style.width = `${Math.max(0, Math.min(100, state.stability))}%`;
    byId('economy-value').textContent = economyLabel();
    byId('pause-button').setAttribute('aria-label', state.paused ? 'استئناف المحاكاة' : 'إيقاف المحاكاة مؤقتاً');
    byId('pause-label').textContent = state.paused ? 'استئناف' : 'إيقاف';
    byId('pause-icon').textContent = state.paused ? '▶' : 'Ⅱ';
    byId('pause-button').classList.toggle('is-paused', state.paused);
    document.querySelectorAll('.speed-option').forEach(button => button.classList.toggle('active', Number(button.dataset.speed) === state.speed));
    byId('section-content').innerHTML = renderSection(activeSection);
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.section === activeSection));
    byId('active-title').textContent = titles[activeSection] || titles.overview;
  }
  function renderSection(section) {
    if (section === 'government') return `<div class="section-heading"><h3>مؤسسات الدولة</h3><span class="eyebrow">الدورة الأولى · ٢٠٢٦</span></div><div class="data-list"><div class="data-row"><span class="data-label">نظام الحكم</span><strong class="data-value">جمهورية برلمانية</strong><span class="data-note">مجلس وطني منتخب · ولاية مدتها أربع سنوات</span></div><div class="data-row"><span class="data-label">ثقة المواطنين</span><strong class="data-value">${format(state.stability)}٪</strong><div class="progress-track"><i style="width:${state.stability}%"></i></div></div><div class="data-row"><span class="data-label">الخدمات العامة</span><strong class="data-value">مستقرة</strong><span class="data-note">الصحة والتعليم والإدارة المدنية</span></div></div><div class="action-card"><div class="section-heading"><h3>برنامج رعاية مجتمعية</h3><span class="eyebrow">٣٥ مليون</span></div><p>تمويل الخدمات الأساسية في الأقاليم الأقل دخلاً. يرفع الثقة ويضيف التزاماً دائماً إلى المصروفات.</p><button class="primary-action" data-action="welfare" ${state.treasury < .035 ? 'disabled' : ''}>اعتماد البرنامج</button></div>`;
    if (section === 'economy') return `<div class="section-heading"><h3>مؤشرات الاقتصاد</h3><button class="subtle-link" data-section-link="reports">عرض التقرير ←</button></div><div class="data-list"><div class="data-row"><span class="data-label">النشاط الاقتصادي</span><strong class="data-value">${economyLabel()}</strong><div class="progress-track"><i style="width:${state.economy}%"></i></div></div><div class="data-row"><span class="data-label">إيرادات الدولة اليومية</span><strong class="data-value">${format(dailyIncome(), 1)} مليون</strong></div><div class="data-row"><span class="data-label">الإنفاق العام اليومي</span><strong class="data-value">${format(dailySpending(), 1)} مليون</strong></div><div class="data-row"><span class="data-label">صافي الموازنة اليومي</span><strong class="data-value">${dailyIncome() >= dailySpending() ? '+' : '−'}${format(Math.abs(dailyIncome() - dailySpending()), 1)} مليون</strong></div></div><div class="action-card"><div class="section-heading"><h3>صندوق تنمية الإنتاج</h3><span class="eyebrow">٦٠ مليون</span></div><p>استثمار موجّه لدعم المشاريع المحلية؛ يحفّز النشاط الاقتصادي تدريجياً.</p><button class="primary-action" data-action="economy" ${state.treasury < .06 ? 'disabled' : ''}>تمويل الصندوق</button></div>`;
    if (section === 'population') return `<div class="section-heading"><h3>ملامح المجتمع</h3><span class="eyebrow">تقديرات وطنية</span></div><div class="data-list"><div class="data-row"><span class="data-label">إجمالي السكان</span><strong class="data-value">${format(state.population, 2)} مليون نسمة</strong><span class="data-note">موزعون على خمسة أقاليم</span></div><div class="data-row"><span class="data-label">معدل النمو السنوي</span><strong class="data-value">١٫٤٪</strong><span class="data-note">معدل أساس مستقر، قبل أثر السياسات</span></div><div class="data-row"><span class="data-label">السكان في المدن</span><strong class="data-value">٦١٪</strong><div class="progress-track"><i style="width:61%"></i></div></div></div><div class="action-card"><div class="section-heading"><h3>عيادة الأقاليم</h3><span class="eyebrow">٤٥ مليون</span></div><p>توسعة الرعاية الصحية الأولية وتحسين الوصول إلى الخدمات في البلدات.</p><button class="primary-action" data-action="clinic" ${state.treasury < .045 ? 'disabled' : ''}>تمويل التوسعة</button></div>`;
    if (section === 'infrastructure') return `<div class="section-heading"><h3>شبكات الدولة</h3><button class="subtle-link" data-section-link="map">عرض الخريطة ←</button></div><div class="data-list"><div class="data-row"><span class="data-label">الطرق المعبدة</span><strong class="data-value">٢٬٤٨٠ كم</strong><span class="data-note">العمود الفقري يربط العاصمة بأربع مدن</span></div><div class="data-row"><span class="data-label">إمدادات الكهرباء</span><strong class="data-value">مستقرة · تغطية ٨٨٪</strong></div><div class="data-row"><span class="data-label">المياه والري</span><strong class="data-value">مستقر · حوض نهر السرو</strong></div><div class="data-row"><span class="data-label">مشاريع الطرق</span><strong class="data-value">${format(state.roadProjects)} قيد التنفيذ</strong></div></div><div class="action-card"><div class="section-heading"><h3>طريق الربط الشرقي</h3><span class="eyebrow">٨٠ مليون</span></div><p>رفع كفاءة الطريق بين العاصمة ومدينة السهل. يدعم الإيرادات بعد بدء التنفيذ.</p><button class="primary-action" data-action="road" ${state.treasury < .08 ? 'disabled' : ''}>بدء المشروع</button></div>`;
    if (section === 'map') return `<div class="section-heading"><h3>أقاليم السهول</h3><span class="eyebrow">٥ أقاليم إدارية</span></div><div class="overview-list"><div class="overview-row"><span class="row-symbol">⌖</span><span class="row-copy"><strong>إقليم العاصمة</strong><small>مرافئ · الإدارة والتجارة</small></span><span class="row-value">٢٫١ م</span></div><div class="overview-row"><span class="row-symbol">⌁</span><span class="row-copy"><strong>إقليم السرو</strong><small>المياه والزراعة</small></span><span class="row-value">١٫٧ م</span></div><div class="overview-row"><span class="row-symbol">◈</span><span class="row-copy"><strong>إقليم السهل</strong><small>الحبوب والصناعات</small></span><span class="row-value">١٫٦ م</span></div><div class="overview-row"><span class="row-symbol">⌂</span><span class="row-copy"><strong>إقليم الميناء</strong><small>التجارة والخدمات البحرية</small></span><span class="row-value">١٫٥ م</span></div></div><p class="data-note">المناطق الحدودية والقرى ظاهرة على الخريطة. حرّكها واسحب للتنقل، واستخدم أدوات التكبير والتدوير.</p>`;
    if (section === 'notifications') return `<div class="section-heading"><h3>آخر المستجدات</h3><span class="eyebrow">${format(state.notices)} تحديثات</span></div><div class="notice-card"><span class="notice-symbol">◈</span><div class="notice-copy"><strong>استقرار الخزانة</strong><p>تتجاوز الإيرادات الحالية المصروفات اليومية بنحو ${format(dailyIncome() - dailySpending(), 1)} مليون.</p><div class="notice-time">تقرير مالي · اليوم</div></div></div><div class="notice-card"><span class="notice-symbol">⌁</span><div class="notice-copy"><strong>نهر السرو في موسمه</strong><p>مخزون المياه ضمن المعدل الموسمي، والري يعمل بكفاءة في الوادي.</p><div class="notice-time">البيئة والمياه · هذا الأسبوع</div></div></div><div class="notice-card"><span class="notice-symbol">⌂</span><div class="notice-copy"><strong>المدن تنمو بهدوء</strong><p>مرافئ أكبر التجمعات السكانية؛ ترتبط بالمدن الإقليمية عبر شبكة الطرق الوطنية.</p><div class="notice-time">السكان · ${dateText()}</div></div></div>`;
    if (section === 'reports') return `<div class="section-heading"><h3>موجز الدولة</h3><span class="eyebrow">${dateText()}</span></div><div class="report-summary"><strong>قراءة اليوم</strong><p>تسير المؤشرات ضمن مسار ${state.stability >= 60 && dailyIncome() >= dailySpending() ? 'مستقر' : 'يحتاج إلى متابعة'}. يرتبط صافي الخزانة بالإيرادات والإنفاق الفعليين، ويتغير مع السياسات ومضي الأيام.</p></div><div class="data-list"><div class="data-row"><span class="data-label">رصيد الخزانة</span><strong class="data-value">${format(state.treasury, 3)} مليار</strong></div><div class="data-row"><span class="data-label">صافي يومي حالي</span><strong class="data-value">${dailyIncome() >= dailySpending() ? '+' : '−'}${format(Math.abs(dailyIncome() - dailySpending()), 1)} مليون</strong></div><div class="data-row"><span class="data-label">أيام المحاكاة المنقضية</span><strong class="data-value">${format(numberOfDays())} يوماً</strong></div><div class="data-row"><span class="data-label">مؤشر النشاط الاقتصادي</span><strong class="data-value">${format(state.economy)} من ١٠٠</strong></div></div>`;
    return `<div class="section-heading"><h3>نبض الدولة</h3><button class="subtle-link" data-section-link="notifications">كل التنبيهات ←</button></div><div class="overview-list"><div class="overview-row"><span class="row-symbol">⌖</span><span class="row-copy"><strong>خمسة أقاليم مترابطة</strong><small>العاصمة مرافئ مركز الإدارة</small></span><span class="row-value">عرض ↙</span></div><div class="overview-row event-row"><span class="row-symbol">◈</span><span class="row-copy"><strong>الموازنة اليومية إيجابية</strong><small>الإيرادات تتجاوز المصروفات</small></span><span class="row-value">+${format(dailyIncome() - dailySpending(), 1)} م</span></div><div class="overview-row"><span class="row-symbol">⌁</span><span class="row-copy"><strong>الأنهار والطرق مستقرة</strong><small>لا توجد اضطرابات في الشبكات</small></span><span class="row-value">مستقر</span></div></div>`;
  }
  function hasSavedGame() { return Boolean(localStorage.getItem(STORE_KEY)); }

  function showStart() {
    byId('start-screen').classList.remove('hidden');
    byId('setup-screen').classList.remove('active');
    byId('game-shell').hidden = true;
    byId('saved-game-label').textContent = hasSavedGame() ? 'متابعة آخر تقدم محفوظ' : 'لا توجد محاكاة محفوظة';
  }

  function openSetup(mode = 'real') {
    setupMode = mode;
    setup.stepMode = mode;
    setupStep = 0;
    byId('start-screen').classList.add('hidden');
    byId('setup-screen').classList.add('active');
    renderSetup();
  }

  function enterGame() {
    state.countrySetup = { ...setup };
    state.countryName = setup.country;
    state.population = setup.population;
    state.treasury = setup.treasury;
    saveState();
    byId('setup-screen').classList.remove('active');
    byId('game-shell').hidden = false;
    renderMetrics();
    showToast(`بدأت محاكاة ${setup.country}`);
  }

  function renderSetup() {
    const steps = ['الأرض والدولة', 'نظام الحكم', 'البداية الاقتصادية', 'المراجعة والانطلاق'];
    byId('setup-step-label').textContent = `الخطوة ${format(setupStep + 1)} من ${format(4)}`;
    byId('setup-progress').innerHTML = steps.map((name, i) => `<div class="setup-step ${i === setupStep ? 'active' : ''} ${i < setupStep ? 'done' : ''}"><i>${i < setupStep ? '✓' : format(i + 1)}</i><span>${name}</span></div>`).join('');
    byId('setup-summary').innerHTML = `<div><span>الدولة</span><strong>${setup.country}</strong></div><div><span>نظام الحكم</span><strong>${setup.government}</strong></div><div><span>السكان</span><strong>${format(setup.population, 1)} مليون</strong></div>`;
    const content = byId('setup-content');
    const isWorld = setupMode === 'world';
    if (setupStep === 0) {
      byId('setup-aside-title').textContent = 'من أين تبدأ؟';
      byId('setup-aside-copy').textContent = 'اختر الأساس الجغرافي وسيُحفظ معه الاسم والنظام الأساسي.';
      content.innerHTML = `<div class="setup-title"><span>الخطوة الأولى</span><h2>${isWorld ? 'صمّم عالمك المخصص' : 'اختر أرض الدولة'}</h2><p>${isWorld ? 'ابدأ بعالم من دول تخيلية متعددة.' : 'حاكم دولة حقيقية، أو أنشئ دولة تخيلية بالكامل.'}</p></div><div class="choice-grid"><button class="choice-card ${setup.setupType === 'real' ? 'selected' : ''}" data-setup-type="real"><span>◎</span><strong>دولة حقيقية</strong><small>خريطة وبيانات بلد حقيقي</small></button><button class="choice-card ${setup.setupType === 'fictional' ? 'selected' : ''}" data-setup-type="fictional"><span>◇</span><strong>دولة تخيلية</strong><small>هوية وبيانات مصممة بالكامل</small></button>${isWorld ? '<button class="choice-card selected" data-setup-type="world"><span>◉</span><strong>عالم متعدد الدول</strong><small>عدة دول وحدود مخصصة</small></button>' : '<button class="choice-card" data-setup-type="scenario"><span>⌛</span><strong>سيناريو مخصص</strong><small>بداية تاريخية أو ظروف محددة</small></button>'}</div><div class="form-grid"><label>${isWorld ? 'اسم العالم' : 'الدولة'}<input id="country-name" value="${isWorld ? setup.worldName : setup.country}" placeholder="اكتب الاسم"></label><label>الاسم الدولي<input id="country-en" value="${setup.countryEn}" placeholder="International name"></label><label>العاصمة<input id="capital-name" value="${setup.capital}"></label><label>اللغة الوطنية<select id="national-language"><option>العربية</option><option>الإنجليزية</option><option>الفرنسية</option></select></label></div><div class="setup-actions"><button class="secondary-action" data-back-home>إلغاء</button><button class="primary-action wide" data-next>متابعة</button></div>`;
    } else if (setupStep === 1) {
      byId('setup-aside-title').textContent = 'قوة المؤسسات';
      byId('setup-aside-copy').textContent = 'اختيارات النظام تؤثر في الهياكل المتاحة للانتخابات والسلطات.';
      content.innerHTML = `<div class="setup-title"><span>نظام الحكم</span><h2>صمّم مؤسساتك</h2><p>اختر الهيكل الدستوري والإدارة والقيادة الأولى.</p></div><div class="choice-grid four"><div class="field"><label>نظام الحكم<select id="government"><option ${setup.government === 'جمهورية برلمانية' ? 'selected' : ''}>جمهورية برلمانية</option><option ${setup.government === 'جمهورية رئاسية' ? 'selected' : ''}>جمهورية رئاسية</option><option ${setup.government === 'ملكية دستورية' ? 'selected' : ''}>ملكية دستورية</option><option ${setup.government === 'دولة فدرالية' ? 'selected' : ''}>دولة فدرالية</option><option ${setup.government === 'حكومة عسكرية' ? 'selected' : ''}>حكومة عسكرية</option></select></label></div><div class="field"><label>الإدارة<select id="administration"><option>مركزية</option><option>لامركزية</option><option>فدرالية</option></select></label></div><div class="field"><label>الزعيم الأول<input id="leader-name" value="${setup.leader}"></label></div><div class="field"><label>الدستور<select id="constitution"><option>دستور وطني مكتوب</option><option>نظام مؤسسي مخصص</option><option>قواعد انتقالية</option></select></label></div></div><div class="institution-panel"><strong>هياكل مؤسسية مقترحة</strong><div><span>السلطة التنفيذية</span><b>رئيس الحكومة ومجلس الوزراء</b></div><div><span>السلطة التشريعية</span><b>مجلس منتخب</b></div><div><span>السلطة القضائية</span><b>محكمة دستورية مستقلة</b></div></div><div class="setup-actions"><button class="secondary-action" data-prev>السابق</button><button class="primary-action wide" data-next>متابعة</button></div>`;
    } else if (setupStep === 2) {
      byId('setup-aside-title').textContent = 'البداية الوطنية';
      byId('setup-aside-copy').textContent = 'التخصيص السريع يكفي للبدء؛ تبقى الإعدادات المتقدمة متاحة لاحقاً.';
      content.innerHTML = `<div class="setup-title"><span>الظروف الوطنية</span><h2>ابدأ بالوتيرة المناسبة</h2><p>اختر إعداداً واقعياً سريعاً أو خصّص المؤشرات الأساسية.</p></div><div class="choice-grid"><button class="choice-card ${setup.quick ? 'selected' : ''}" data-quick="true"><span>⚡</span><strong>إعداد سريع</strong><small>إطلالات واقعية جاهزة</small></button><button class="choice-card ${!setup.quick ? 'selected' : ''}" data-quick="false"><span>☷</span><strong>إعداد متقدم</strong><small>ضبط السكان والخزينة والموارد</small></button></div><div class="form-grid"><label>السكان بالمليون<input id="population" type="number" min="0.1" step="0.1" value="${setup.population}"></label><label>الخزينة بالمليار<input id="treasury" type="number" min="0" step="0.1" value="${setup.treasury}"></label><label>العملة<input id="currency" value="${setup.currency}"></label><label>رمز العملة<input id="currency-symbol" value="${setup.symbol}"></label></div><div class="form-grid"><label>مستوى التنمية<select id="development"><option ${setup.development === 'متوسط' ? 'selected' : ''}>متوسط</option><option ${setup.development === 'متقدم' ? 'selected' : ''}>متقدم</option><option ${setup.development === 'نامي' ? 'selected' : ''}>نامي</option></select></label><label>الموارد الوطنية<input id="resources" value="${setup.resources}"></label></div><div class="setup-actions"><button class="secondary-action" data-prev>السابق</button><button class="primary-action wide" data-next>مراجعة البداية</button></div>`;
    } else {
      byId('setup-aside-title').textContent = 'جاهز للانطلاق؟';
      byId('setup-aside-copy').textContent = 'ستُحفظ هذه الخطة محلياً ويبدأ التاريخ الوطني فور تأكيدك.';
      content.innerHTML = `<div class="setup-title"><span>المراجعة النهائية</span><h2>${setup.country}</h2><p>راجع هوية الدولة قبل دخول واجهة الإدارة.</p></div><div class="review-grid"><div><span>العاصمة</span><strong>${setup.capital}</strong></div><div><span>نظام الحكم</span><strong>${setup.government}</strong></div><div><span>السكان</span><strong>${format(setup.population, 1)} مليون</strong></div><div><span>العملة</span><strong>${setup.currency} · ${setup.symbol}</strong></div><div><span>الخزينة</span><strong>${format(setup.treasury, 1)} مليار</strong></div><div><span>التنمية</span><strong>${setup.development}</strong></div></div><div class="map-readiness glass"><span>◎</span><div><strong>قاعدة الخريطة الجغرافية</strong><p>يتطلب عرض الصور الفضائية الحقيقية مزوداً مثل Google Maps أو Mapbox مع مفتاح وترخيص وربط مكتبة الخرائط. لن تُعرض خريطة شكلية كصورة فضائية في هذه المرحلة.</p></div></div><div class="setup-actions"><button class="secondary-action" data-prev>السابق</button><button class="primary-action wide" data-start-game>بدء المحاكاة</button></div>`;
    }
  }

  function captureSetup() {
    const get = id => byId(id)?.value;
    if (setupStep === 0) { setup.country = get('country-name') || setup.country; setup.countryEn = get('country-en') || setup.countryEn; setup.capital = get('capital-name') || setup.capital; if (setupMode === 'world') setup.worldName = setup.country; setup.language = get('national-language') || setup.language; }
    if (setupStep === 1) { setup.government = get('government') || setup.government; setup.administration = get('administration') || setup.administration; setup.leader = get('leader-name') || setup.leader; }
    if (setupStep === 2) { setup.population = Number(get('population')) || setup.population; setup.treasury = Number(get('treasury')) || setup.treasury; setup.currency = get('currency') || setup.currency; setup.symbol = get('currency-symbol') || setup.symbol; setup.development = get('development') || setup.development; setup.resources = get('resources') || setup.resources; }
  }

  function showToast(message) {
    const toast = byId('toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function setSection(section) {
    if (!titles[section]) return;
    activeSection = section; renderMetrics();
    if (['map', 'overview'].includes(section)) showToast(section === 'map' ? 'الخريطة الوطنية جاهزة للاستكشاف' : 'أهلاً بك في إقليم السهول');
  }
  function advanceDay() {
    const date = dayDate(); date.setUTCDate(date.getUTCDate() + 1);
    state.day = date.toISOString().slice(0, 10);
    const net = dailyIncome() - dailySpending();
    state.treasury = Math.max(0, state.treasury + net / 1000);
    state.population = +(state.population + state.population * 0.014 / 365 + state.clinicProjects * 0.000002).toFixed(6);
    state.economy = Math.max(0, Math.min(100, state.economy + (net >= 0 ? 0.004 : -0.015) + state.roadProjects * 0.0003));
    if (state.treasury < 0.2) state.stability = Math.max(0, state.stability - 0.025);
    if (numberOfDays() % 30 === 0) state.notices += 1;
    saveState(); renderMetrics();
  }
  document.querySelectorAll('[data-start-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.startAction;
    if (action === 'continue') {
      if (!hasSavedGame()) return showToast('لا توجد محاكاة محفوظة بعد');
      state = loadState(); byId('start-screen').classList.add('hidden'); byId('game-shell').hidden = false; renderMetrics(); showToast('تمت متابعة المحاكاة المحفوظة');
    } else openSetup(action === 'world' ? 'world' : 'real');
  }));
  byId('start-settings-button').addEventListener('click', () => byId('settings-dialog')?.showModal?.());
  byId('setup-close').addEventListener('click', showStart);
  byId('setup-back').addEventListener('click', () => { if (setupStep > 0) { setupStep--; renderSetup(); } else showStart(); });
  byId('setup-content').addEventListener('click', event => {
    const type = event.target.closest('[data-setup-type]'); if (type) { setup.setupType = type.dataset.setupType; if (setup.setupType === 'fictional') { setup.country = 'دولة الواحة'; setup.countryEn = 'Al Waha'; } if (setup.setupType === 'real') { setup.country = 'المملكة الأردنية الهاشمية'; setup.countryEn = 'Jordan'; } renderSetup(); }
    const quick = event.target.closest('[data-quick]'); if (quick) { setup.quick = quick.dataset.quick === 'true'; renderSetup(); }
    if (event.target.closest('[data-back-home]')) showStart();
    if (event.target.closest('[data-prev]')) { captureSetup(); setupStep = Math.max(0, setupStep - 1); renderSetup(); }
    if (event.target.closest('[data-next]')) { captureSetup(); setupStep = Math.min(3, setupStep + 1); renderSetup(); }
    if (event.target.closest('[data-start-game]')) enterGame();
  });

  document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setSection(item.dataset.section)));
  byId('section-content').addEventListener('click', event => {
    const link = event.target.closest('[data-section-link]'); if (link) return setSection(link.dataset.sectionLink);
    const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
    const actions = {
      welfare: { cost: .035, key: 'welfarePrograms', title: 'أُقرّ برنامج الرعاية المجتمعية', effect: () => { state.stability = Math.min(100, state.stability + 3); } },
      economy: { cost: .06, key: null, title: 'بدأ صندوق تنمية الإنتاج', effect: () => { state.economy = Math.min(100, state.economy + 4); } },
      clinic: { cost: .045, key: 'clinicProjects', title: 'بدأت توسعة عيادة الأقاليم', effect: () => { state.stability = Math.min(100, state.stability + 1); } },
      road: { cost: .08, key: 'roadProjects', title: 'بدأ مشروع طريق الربط الشرقي', effect: () => { state.economy = Math.min(100, state.economy + 1); } }
    };
    const action = actions[button.dataset.action]; if (!action) return;
    if (state.treasury < action.cost) return showToast('الرصيد غير كافٍ لاعتماد هذا المشروع');
    state.treasury = +(state.treasury - action.cost).toFixed(3);
    if (action.key) state[action.key] += 1;
    action.effect(); saveState(); renderMetrics(); showToast(action.title);
  });
  byId('pause-button').addEventListener('click', () => { state.paused = !state.paused; saveState(); renderMetrics(); showToast(state.paused ? 'أُوقفت المحاكاة مؤقتاً' : 'استؤنفت المحاكاة'); });
  document.querySelectorAll('.speed-option').forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); saveState(); renderMetrics(); showToast(`سرعة المحاكاة ${format(state.speed)}×`); }));
  setInterval(() => {
    const now = Date.now(); const elapsed = Math.min(now - lastFrame, 2500); lastFrame = now;
    if (state.paused) return;
    dayProgress += elapsed * state.speed / 6000;
    if (dayProgress >= 1) { dayProgress -= 1; advanceDay(); }
  }, 1000);

  const svg = byId('world-map'); const canvas = byId('map-canvas');
  let view = { x: 0, y: 0, w: 1000, h: 680 }; let drag = null;
  function applyView() { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function zoom(factor, x = view.x + view.w / 2, y = view.y + view.h / 2) {
    const nextW = Math.max(420, Math.min(1500, view.w * factor)); const nextH = nextW * .68;
    const rx = (x - view.x) / view.w; const ry = (y - view.y) / view.h;
    view = { x: x - rx * nextW, y: y - ry * nextH, w: nextW, h: nextH }; applyView();
  }
  byId('zoom-in').addEventListener('click', () => zoom(.8)); byId('zoom-out').addEventListener('click', () => zoom(1.25));
  byId('rotate-map').addEventListener('click', () => {
    rotation = (rotation + 15) % 360;
    const country = svg.querySelector('#country-shape');
    country.setAttribute('transform', `rotate(${rotation} 455 348)`);
    showToast(`دوران الخريطة ${format(rotation)}°`);
  });
  byId('reset-map').addEventListener('click', () => { view = { x: 0, y: 0, w: 1000, h: 680 }; rotation = 0; svg.querySelector('#country-shape').removeAttribute('transform'); applyView(); });
  function pointToMap(event) { const rect = svg.getBoundingClientRect(); return { x: view.x + (event.clientX - rect.left) / rect.width * view.w, y: view.y + (event.clientY - rect.top) / rect.height * view.h }; }
  canvas.addEventListener('pointerdown', event => { if (event.target.closest('.map-controls,.map-legend,.map-bottom,.map-topline,.map-tooltip')) return; drag = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, moved: false }; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); });
  canvas.addEventListener('pointermove', event => {
    if (drag) {
      const rect = svg.getBoundingClientRect(); const dx = (event.clientX - drag.x) / rect.width * view.w; const dy = (event.clientY - drag.y) / rect.height * view.h;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      view.x = drag.viewX - dx; view.y = drag.viewY - dy; applyView(); return;
    }
    const city = event.target.closest?.('.city'); if (!city) return;
    const tip = byId('map-tooltip'); tip.textContent = city.dataset.city; tip.style.left = `${Math.min(event.offsetX + 14, canvas.clientWidth - 120)}px`; tip.style.top = `${Math.max(60, event.offsetY - 12)}px`; tip.classList.add('show');
  });
  canvas.addEventListener('pointerup', event => { if (drag?.moved) { event.preventDefault(); } drag = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('pointerleave', () => byId('map-tooltip').classList.remove('show'));
  canvas.addEventListener('wheel', event => { event.preventDefault(); const rect = svg.getBoundingClientRect(); const x = view.x + (event.clientX - rect.left) / rect.width * view.w; const y = view.y + (event.clientY - rect.top) / rect.height * view.h; zoom(event.deltaY < 0 ? .9 : 1.1, x, y); }, { passive: false });
  svg.querySelectorAll('.city').forEach(city => {
    const select = event => { event.stopPropagation(); if (drag?.moved) return; showToast(`${city.dataset.city} · مركز حضري في شبكة الدولة`); };
    city.addEventListener('click', select); city.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') select(event); });
  });
  byId('open-map-button').addEventListener('click', () => setSection('map'));
  byId('layers-button').addEventListener('click', () => {
    const map = svg.classList; const enabled = map.toggle('roads-hidden');
    if (enabled) { svg.querySelectorAll('.roads').forEach(el => el.style.opacity = '.12'); showToast('عُرضت حدود الأقاليم والتضاريس'); }
    else { svg.querySelectorAll('.roads').forEach(el => el.style.opacity = '1'); showToast('عُرضت الطرق والمدن والأنهار'); }
  });
  byId('fullscreen-button').addEventListener('click', async () => {
    try { if (!document.fullscreenElement) await byId('world-map').closest('.world-panel').requestFullscreen(); else await document.exitFullscreen(); }
    catch (error) { showToast('ملء الشاشة غير متاح في هذا المتصفح'); }
  });
  const settings = byId('settings-dialog');
  byId('settings-button').addEventListener('click', () => settings.showModal());
  byId('country-menu').addEventListener('click', () => settings.showModal());
  byId('sound-toggle').addEventListener('click', () => showToast('المؤثرات الصوتية غير مفعّلة في هذه المرحلة'));
  byId('help-toggle').addEventListener('click', () => showToast('اسحب الخريطة للتنقل؛ قراراتك تغيّر المؤشرات الوطنية'));
  byId('reset-save').addEventListener('click', () => {
    if (!confirm('هل تريد بدء محاكاة جديدة؟ سيُحذف الحفظ المحلي الحالي.')) return;
    state = { ...START_STATE }; dayProgress = 0; saveState(); activeSection = 'overview'; settings.close(); renderMetrics(); showToast('بدأت محاكاة جديدة في إقليم السهول');
  });
  showStart();
  renderMetrics();
})();
