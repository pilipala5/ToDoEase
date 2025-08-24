class ToDoEase {
  constructor() {
    /** 任务与 UI 状态 **/
    this.tasks = [];
    this.currentTaskId = null;
    this.currentSubtaskInput = null;
    this.collapseState = new Map();

    /** 日历状态 - 简化管理 **/
    this.currentDisplayMonth = new Date();  // 当前显示的月份（仅年月）
    this.selectedDate = new Date();         // 当前选中的日期，默认为今天
    this.calendarData = new Map();          // Map<'YYYY-MM-DD', {total, completed}>
    this.isFilteringByDate = false;         // 是否正在按日期过滤
    this.firstLoad = true;   // ✅ 首次加载兜底

    this.init();
  }

  /** ------------ 初始化与事件绑定 ------------ **/
  init() {
    this.bindEvents();
    this.bindCalendarEvents();
    this.updateDate();

    // ✅ 打开即按今天过滤
    const today = new Date();
    this.selectedDate = today;
    this.isFilteringByDate = true;
    this.updateTopDate(today);   // 同步头部日期显示

    this.loadTasks();
  }


  bindEvents() {
    const taskInput = document.getElementById("taskInput");
    const addTaskBtn = document.getElementById("addTaskBtn");

    if (taskInput) {
      taskInput.addEventListener("keydown", (e) => this.handleInputKeydown(e));
    }
    if (addTaskBtn) {
      addTaskBtn.addEventListener("click", async () => {
        if (!taskInput) return;
        const value = taskInput.value.trim();
        if (!value) return;
        await this.createTask(value);
        taskInput.value = "";
      });
    }

    // 全局快捷键
    document.addEventListener("keydown", (e) => this.handleGlobalKeydown(e));

    // 列表区域：事件委托
    document.addEventListener("click", (e) => {
      // 切换任务完成
      const checkbox = e.target.closest(".task-checkbox");
      if (checkbox) {
        e.preventDefault();
        e.stopPropagation();
        const { taskId, subtaskId } = checkbox.dataset;
        if (taskId) this.toggleTask(parseInt(taskId));
        else if (subtaskId) this.toggleSubtask(parseInt(subtaskId));
        return;
      }

      // 删除任务
      const delTaskBtn = e.target.closest(".delete-btn");
      if (delTaskBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteTask(parseInt(delTaskBtn.dataset.taskId));
        return;
      }

      // 删除子任务
      const delSubBtn = e.target.closest(".delete-subtask-btn");
      if (delSubBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteSubtask(parseInt(delSubBtn.dataset.subtaskId));
        return;
      }

      // 添加子任务
      const addSubBtn = e.target.closest(".add-subtask-btn");
      if (addSubBtn) {
        e.preventDefault();
        e.stopPropagation();
        const taskId = parseInt(addSubBtn.dataset.taskId);
        this.showSubtaskInput(taskId);
        return;
      }

      // 折叠/展开
      const collapseBtn = e.target.closest(".collapse-btn");
      if (collapseBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCollapse(parseInt(collapseBtn.dataset.taskId));
        return;
      }

    });
  }

  bindCalendarEvents() {
    const prevMonthBtn = document.getElementById("prevMonth");
    const nextMonthBtn = document.getElementById("nextMonth");
    const jumpToTodayBtn = document.getElementById("jumpToToday");
    const dateInput = document.getElementById("calendarDateInput");
    
    if (prevMonthBtn) prevMonthBtn.addEventListener("click", () => this.navigateMonth(-1));
    if (nextMonthBtn) nextMonthBtn.addEventListener("click", () => this.navigateMonth(1));
    if (jumpToTodayBtn) jumpToTodayBtn.addEventListener("click", () => this.jumpToToday());
    
    // 日期选择器事件
    if (dateInput) {
      // 设置默认值为今天
      const today = new Date();
      dateInput.value = this.formatDateKey(today);
      
      dateInput.addEventListener("change", (e) => {
        const selectedDate = new Date(e.target.value);
        if (!isNaN(selectedDate.getTime())) {
          this.selectDate(selectedDate);
        }
      });
    }
  }

  updateCalendarHeader() {
    const title = document.getElementById("calendarTitle");
    if (!title) return;
    const y = this.currentDisplayMonth.getFullYear();
    const m = this.currentDisplayMonth.getMonth() + 1;
    title.textContent = `${y}年${m}月`;
  }

  updateDate() {
    const now = new Date();
    const el = document.getElementById("currentDate");
    if (el) {
      el.textContent = now.toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric", weekday: "long",
      });
    }
  }

  // 更新顶部日期显示为选中的日期
  updateTopDate(date) {
    const el = document.getElementById("currentDate");
    if (el) {
      el.textContent = date.toLocaleDateString("zh-CN", {
        year: "numeric", month: "long", day: "numeric", weekday: "long",
      });
    }
  }

  /** ------------ 工具函数 ------------ **/
  // 格式化日期为 YYYY-MM-DD (本地时间)
  formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 判断两个日期是否为同一天（本地时间）
  isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  // 解析服务器日期
  parseServerDate(dateStr) {
    // 如果日期字符串没有时区信息，按UTC解析
    if (typeof dateStr === "string" && !/[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr)) {
      return new Date(dateStr + "Z");
    }
    return new Date(dateStr);
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /** ------------ API：任务 CRUD ------------ **/
  async loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      this.tasks = Array.isArray(data) ? data : [];
      this.tasks.forEach(t => { if (!Array.isArray(t.subtasks)) t.subtasks = []; });

      // ✅ 首次加载兜底：确保默认显示“今天的任务”
      if (this.firstLoad) {
        const today = new Date();
        this.selectedDate = today;
        this.isFilteringByDate = true;
        this.updateTopDate(today);
        this.firstLoad = false;
      }

      // 渲染任务列表（会根据 isFilteringByDate 决定渲染哪一类）
      this.renderCurrentView();

      // 更新日历/统计
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
    } catch (err) {
      console.error("加载任务失败:", err);
      this.tasks = [];
      this.renderCurrentView();
      this.updateStats && this.updateStats();
    }
  }


  // 根据当前状态渲染视图
  renderCurrentView() {
    if (this.isFilteringByDate && this.selectedDate) {
      // 按日期过滤任务
      const filtered = this.filterTasksByDate(this.selectedDate);
      this.renderFilteredTasks(filtered);
    } else {
      // 显示所有任务
      this.renderAllTasks();
    }
  }

  // 过滤指定日期的任务
  filterTasksByDate(date) {
    const dateKey = this.formatDateKey(date);
    return this.tasks.filter(task => {
      // 使用task_date字段进行过滤，而不是created_at
      return task.task_date === dateKey;
    });
  }



  async createTask(title, description = "", customDate = null) {
    try {
      // 使用自定义日期、选中日期或当前日期
      let taskDate;
      if (customDate) {
        taskDate = this.formatDateKey(customDate);
      } else if (this.isFilteringByDate && this.selectedDate) {
        taskDate = this.formatDateKey(this.selectedDate);
      } else {
        taskDate = this.formatDateKey(new Date());
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, task_date: taskDate }),
      });
      if (!res.ok) throw new Error(res.statusText || res.status);
      const task = await res.json();
      if (!Array.isArray(task.subtasks)) task.subtasks = [];
      this.tasks.push(task);

      // 如果当前正在过滤，保持过滤状态
      this.renderCurrentView();
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
      return task.id;
    } catch (err) {
      console.error("创建任务失败:", err);
      return null;
    }
  }

  async toggleTask(taskId) {
    try {
      const task = this.tasks.find(t => t.id === taskId);
      if (!task) return;
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !task.completed }),
      });
      if (!res.ok) return;
      task.completed = !task.completed;

      this.renderCurrentView();
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
    } catch (err) {
      console.error("更新任务失败:", err);
    }
  }

  async toggleSubtask(subtaskId) {
    try {
      let parent = null, subtask = null;
      for (const t of this.tasks) {
        const s = t.subtasks?.find(x => x.id === subtaskId);
        if (s) { parent = t; subtask = s; break; }
      }
      if (!subtask) return;

      const res = await fetch(`/api/subtasks/${subtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !subtask.completed }),
      });
      if (!res.ok) return;

      subtask.completed = !subtask.completed;
      this.renderCurrentView();
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
    } catch (err) {
      console.error("更新子任务失败:", err);
    }
  }

  async deleteTask(taskId) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) return;
      this.tasks = this.tasks.filter(t => t.id !== taskId);
      this.collapseState.delete(taskId);

      this.renderCurrentView();
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
    } catch (err) {
      console.error("删除任务失败:", err);
    }
  }

  async createSubtask(taskId, title) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(res.statusText || res.status);
      const subtask = await res.json();

      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        task.subtasks = task.subtasks || [];
        task.subtasks.push(subtask);
        this.collapseState.set(taskId, false);
        this.renderCurrentView();
        this.updateStats();
        this.buildCalendarData();
        this.renderCalendar();
        await this.updateMonthlyStats();
      }
    } catch (err) {
      console.error("创建子任务失败:", err);
    }
  }

  async deleteSubtask(subtaskId) {
    try {
      const res = await fetch(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
      if (!res.ok) return;
      for (const t of this.tasks) {
        t.subtasks = (t.subtasks || []).filter(s => s.id !== subtaskId);
      }
      this.renderCurrentView();
      this.buildCalendarData();
      this.renderCalendar();
      await this.updateMonthlyStats();
    } catch (err) {
      console.error("删除子任务失败:", err);
    }
  }

  /** ------------ 列表渲染 ------------ **/
  renderAllTasks() {
    const incomplete = this.tasks.filter(t => !t.completed);
    const completed = this.tasks.filter(t => t.completed);
    this.renderTaskColumns(incomplete, completed);
  }

  renderFilteredTasks(tasks) {
    const incomplete = tasks.filter(t => !t.completed);
    const completed = tasks.filter(t => t.completed);
    this.renderTaskColumns(incomplete, completed);
  }

  renderTaskColumns(incomplete, completed) {
    const incompleteEl = document.getElementById("incompleteTasks");
    const completedEl = document.getElementById("completedTasks");
    if (!incompleteEl || !completedEl) return;

    incompleteEl.innerHTML = "";
    completedEl.innerHTML = "";

    incomplete.forEach(t => {
      const el = this.createTaskElement(t);
      incompleteEl.appendChild(el);
      this.makeDraggable(el);
    });
    completed.forEach(t => {
      const el = this.createTaskElement(t);
      completedEl.appendChild(el);
      this.makeDraggable(el);
    });

    // 更新计数
    const inCnt = document.getElementById("incompleteCount");
    const cCnt = document.getElementById("completeCount");
    if (inCnt) inCnt.textContent = incomplete.length;
    if (cCnt) cCnt.textContent = completed.length;

    // 绑定拖放
    this.bindTaskListDnD(incompleteEl);
    this.bindTaskListDnD(completedEl);
  }

  createTaskElement(task) {
    const el = document.createElement("div");
    el.className = `task-item ${task.completed ? "completed" : ""}`;
    el.dataset.taskId = task.id;

    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
    const isCollapsed = this.collapseState.get(task.id) ?? false;

    el.innerHTML = `
      <div class="task-content">
        <div class="drag-handle">⋮⋮</div>
        <div class="task-checkbox ${task.completed ? "checked" : ""}" data-task-id="${task.id}"></div>
        <div class="task-text">
          <div class="task-title ${task.completed ? "completed" : ""}">${this.escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ""}
        </div>
        <div class="task-actions">
          <button class="action-btn add-subtask-btn" data-task-id="${task.id}" title="添加子任务">+</button>
          <button class="action-btn delete-btn" data-task-id="${task.id}" title="删除">×</button>
          ${hasSubtasks ? `<button class="collapse-btn ${isCollapsed ? "collapsed" : ""}" data-task-id="${task.id}">${isCollapsed ? "▶" : "▼"}</button>` : ""}
        </div>
      </div>
      <div class="subtasks ${isCollapsed ? "collapsed" : ""}" style="${hasSubtasks ? "" : "display:none"}">
        ${hasSubtasks ? this.renderSubtasks(task.subtasks) : ""}
      </div>
    `;
    return el;
  }

  renderSubtasks(subtasks) {
    return subtasks.map(s => `
      <div class="subtask-item">
        <div class="task-checkbox ${s.completed ? "checked" : ""}" data-subtask-id="${s.id}"></div>
        <div class="subtask-title ${s.completed ? "completed" : ""}">${this.escapeHtml(s.title)}</div>
        <button class="action-btn delete-subtask-btn" data-subtask-id="${s.id}" title="删除">×</button>
      </div>
    `).join("");
  }

  /** ------------ DnD 相关 ------------ **/
  makeDraggable(taskElement) {
    const handle = taskElement.querySelector(".drag-handle");
    if (!handle) return;

    handle.addEventListener("mousedown", () => { taskElement.draggable = true; });
    taskElement.addEventListener("dragstart", (e) => {
      taskElement.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", taskElement.dataset.taskId);
    });
    taskElement.addEventListener("dragend", () => {
      taskElement.classList.remove("dragging");
      taskElement.draggable = false;
    });
  }

  bindTaskListDnD(listEl) {
    if (!listEl || listEl.__dndBound) return;
    listEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = document.querySelector(".dragging");
      if (!dragging) return;
      const after = this.getDragAfterElement(listEl, e.clientY);
      if (after == null) listEl.appendChild(dragging);
      else listEl.insertBefore(dragging, after);
    });
    listEl.addEventListener("drop", async () => {
      const ids = Array.from(listEl.children).map(el => parseInt(el.dataset.taskId));
      await this.saveTaskOrder(ids);
      await this.loadTasks();
    });
    listEl.__dndBound = true;
  }

  getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll(".task-item:not(.dragging)")];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  async saveTaskOrder(taskIds) {
    try {
      await fetch("/api/tasks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskIds),
      });
    } catch (err) {
      console.error("保存任务顺序失败:", err);
    }
  }

  /** ------------ 月度统计 ------------ **/

  async updateMonthlyStats() {
    try {
      const year = this.currentDisplayMonth.getFullYear();
      const month = this.currentDisplayMonth.getMonth() + 1;
      const res = await fetch(`/api/stats/monthly?year=${year}&month=${month}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stats = await res.json();

      const totalEl = document.getElementById("monthTotalTasks");
      const completedEl = document.getElementById("monthCompletedTasks");
      const rateEl = document.getElementById("monthCompletionRate");

      if (totalEl) totalEl.textContent = stats.total_tasks ?? 0;
      if (completedEl) completedEl.textContent = stats.completed_tasks ?? 0;
      const rate = (stats.total_tasks > 0)
        ? Math.round((stats.completed_tasks / stats.total_tasks) * 100)
        : 0;
      if (rateEl) rateEl.textContent = `${rate}%`;
    } catch (err) {
      console.error("更新月度统计失败:", err);
      // 降级处理
      const totalEl = document.getElementById("monthTotalTasks");
      const completedEl = document.getElementById("monthCompletedTasks");
      const rateEl = document.getElementById("monthCompletionRate");
      if (totalEl) totalEl.textContent = "0";
      if (completedEl) completedEl.textContent = "0";
      if (rateEl) rateEl.textContent = "0%";
    }
  }

  /** ------------ 日历功能 - 完全重写 ------------ **/
  navigateMonth(direction) {
    const newDate = new Date(this.currentDisplayMonth);
    newDate.setMonth(newDate.getMonth() + direction);
    this.currentDisplayMonth = newDate;
    
    this.renderCalendar();
    this.updateMonthlyStats();
  }

  // 快速跳转到指定月份
  jumpToMonth(year, month) {
    this.currentDisplayMonth = new Date(year, month - 1, 1);
    this.renderCalendar();
    this.updateMonthlyStats();
  }

  // 跳转到今天
  jumpToToday() {
    const today = new Date();
    this.currentDisplayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    this.selectedDate = new Date(today);
    this.isFilteringByDate = true;
    
    this.updateTopDate(today);
    this.renderCalendar();
    this.renderCurrentView();
    this.updateMonthlyStats();
  }

  // 构建日历数据（统计每天的任务）
  buildCalendarData() {
    this.calendarData.clear();
    
    this.tasks.forEach(task => {
      // 直接使用task_date字段，无需解析
      const dateKey = task.task_date;
      
      const data = this.calendarData.get(dateKey) || { total: 0, completed: 0 };
      data.total += 1;
      if (task.completed) data.completed += 1;
      this.calendarData.set(dateKey, data);
    });
  }

  renderCalendar() {
    this.updateCalendarHeader();
    const daysContainer = document.getElementById("calendarDays");
    if (!daysContainer) return;
    daysContainer.innerHTML = "";

    this.buildCalendarData(); // 先更新日历数据

    const year = this.currentDisplayMonth.getFullYear();
    const month = this.currentDisplayMonth.getMonth();

    // 获取当月第一天和最后一天
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay(); // 0 = 周日
    const daysInMonth = lastDay.getDate();

    // 计算需要显示的天数（包括前后月份的补充）
    const totalCells = 42; // 6周 * 7天
    const startDate = new Date(year, month, 1 - firstDayOfWeek);

    // 渲染日历格子 - 使用文档片段提高性能
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalCells; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dayEl = this.createCalendarDayElement(currentDate);
      fragment.appendChild(dayEl);
    }
    daysContainer.appendChild(fragment);
  }

  createCalendarDayElement(date) {
    const dayDiv = document.createElement("div");
    dayDiv.classList.add("calendar-day");

    const dateKey = this.formatDateKey(date);
    const dayData = this.calendarData.get(dateKey);
    const today = new Date();

    // 检查是否为当前月份
    const isCurrentMonth = date.getMonth() === this.currentDisplayMonth.getMonth() &&
                          date.getFullYear() === this.currentDisplayMonth.getFullYear();
    
    if (!isCurrentMonth) {
      dayDiv.classList.add("other-month");
    }

    // 标记今天
    if (this.isSameDay(date, today)) {
      dayDiv.classList.add("today");
    }

    // 标记选中的日期
    if (this.selectedDate && this.isSameDay(date, this.selectedDate)) {
      dayDiv.classList.add("selected");
    }

    // 添加任务指示器 - 修复类名匹配问题
    if (dayData && dayData.total > 0) {
      if (dayData.completed >= dayData.total) {
        dayDiv.classList.add("completed-all");
      } else if (dayData.completed > 0) {
        dayDiv.classList.add("completed-partial");
      } else {
        dayDiv.classList.add("not-completed");
      }
    }

    dayDiv.innerHTML = `
      <div class="calendar-day-number">${date.getDate()}</div>
      ${dayData && dayData.total > 0 ? '<div class="calendar-day-indicator"></div>' : ''}
    `;

    // 点击事件 - 简化逻辑
    dayDiv.addEventListener("click", () => {
      this.selectDate(date);
    });

    // 双击事件 - 快速创建任务
    dayDiv.addEventListener("dblclick", () => {
      this.selectDate(date);
      this.promptQuickTask(date);
    });

    return dayDiv;
  }

  /** ------------ 新的日期选择逻辑 ------------ **/
  selectDate(date) {
    // 无论点击哪个月份，都直接选中该日期
    this.selectedDate = new Date(date);
    this.isFilteringByDate = true;
    
    // 如果点击的是其他月份，自动跳转到该月份
    const targetMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    if (!this.isSameMonth(targetMonth, this.currentDisplayMonth)) {
      this.currentDisplayMonth = targetMonth;
      this.updateMonthlyStats();
    }
    
    // 更新顶部日期显示
    this.updateTopDate(date);
    
    // 重新渲染
    this.renderCurrentView();
    this.renderCalendar();
  }

  // 检查两个日期是否为同一个月
  isSameMonth(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth();
  }

  // 快速创建任务弹窗
  promptQuickTask(date) {
    const taskText = prompt(`在 ${date.toLocaleDateString('zh-CN')} 创建任务：`);
    if (taskText && taskText.trim()) {
      this.createTask(taskText.trim(), date);
    }
  }

  /** ------------ 折叠/展开 ------------ **/
  toggleCollapse(taskId) {
    const item = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!item) return;
    const subtasks = item.querySelector(".subtasks");
    const btn = item.querySelector(".collapse-btn");
    if (!subtasks) return;

    const collapsed = subtasks.classList.contains("collapsed");
    if (collapsed) {
      subtasks.style.display = "block";
      subtasks.classList.remove("collapsed");
      btn?.classList.remove("collapsed");
      if (btn) btn.textContent = "▼";
      this.collapseState.set(taskId, false);
    } else {
      subtasks.style.display = "none";
      subtasks.classList.add("collapsed");
      btn?.classList.add("collapsed");
      if (btn) btn.textContent = "▶";
      this.collapseState.set(taskId, true);
    }
  }

  /** ------------ 输入/快捷键 ------------ **/
  async handleInputKeydown(e) {
    const input = e.target;
    if (e.key === "Enter" && input.value.trim()) {
      if (input.classList.contains("subtask-input")) {
        await this.createSubtask(this.currentTaskId, input.value.trim());
        input.closest(".subtask-input-wrapper")?.remove();
        this.currentSubtaskInput = null;
      } else {
        await this.createTask(input.value.trim());
        input.value = "";
      }
    } else if (e.key === "Escape") {
      if (input.classList.contains("subtask-input")) {
        input.closest(".subtask-input-wrapper")?.remove();
        this.currentSubtaskInput = null;
      } else {
        input.value = "";
      }
    } else if (e.key === "Tab" && input.id === "taskInput" && input.value.trim()) {
      e.preventDefault();
      const taskId = await this.createTask(input.value.trim());
      input.value = "";
      if (taskId != null) this.showSubtaskInput(taskId);
    }
  }

  handleGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      document.getElementById("taskInput")?.focus();
    }
  }

  showSubtaskInput(taskId) {
    if (this.currentSubtaskInput) {
      this.currentSubtaskInput.closest(".subtask-input-wrapper")?.remove();
      this.currentSubtaskInput = null;
    }
    const subtasks = document.querySelector(`[data-task-id="${taskId}"] .subtasks`);
    if (!subtasks) return;

    // 展开子任务区域
    subtasks.style.display = "block";
    subtasks.classList.remove("collapsed");
    const btn = document.querySelector(`[data-task-id="${taskId}"] .collapse-btn`);
    btn?.classList.remove("collapsed");
    if (btn) btn.textContent = "▼";
    this.collapseState.set(taskId, false);

    // 创建输入框
    const wrapper = document.createElement("div");
    wrapper.className = "subtask-input-wrapper";
    wrapper.dataset.taskId = String(taskId);
    wrapper.style.padding = "8px 20px 8px 60px";
    wrapper.style.display = "flex";
    wrapper.style.gap = "8px";
    wrapper.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "subtask-input";
    input.placeholder = "添加子任务...";
    input.addEventListener("keydown", (e) => this.handleInputKeydown(e));
    input.style.cssText = `
      flex: 1 1 auto;
      padding: 10px 12px;
      border: 1px solid #eee;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
      background: #fff;
    `;

    const confirm = document.createElement("button");
    confirm.className = "confirm-subtask-btn";
    confirm.textContent = "确认";
    confirm.style.cssText = `
      padding: 8px 12px; border: none; border-radius: 8px;
      background: #4f46e5; color: #fff; font-size: 13px; cursor: pointer;
    `;
    confirm.addEventListener("click", async () => {
      const v = input.value.trim();
      if (v) await this.createSubtask(taskId, v);
      wrapper.remove();
      this.currentSubtaskInput = null;
    });

    const cancel = document.createElement("button");
    cancel.className = "cancel-subtask-btn";
    cancel.textContent = "取消";
    cancel.style.cssText = `
      padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px;
      background: #fff; color: #333; font-size: 13px; cursor: pointer;
    `;
    cancel.addEventListener("click", () => {
      wrapper.remove();
      this.currentSubtaskInput = null;
    });

    wrapper.appendChild(input);
    wrapper.appendChild(confirm);
    wrapper.appendChild(cancel);
    subtasks.appendChild(wrapper);
    input.focus();

    this.currentTaskId = taskId;
    this.currentSubtaskInput = input;
  }
}

/** 启动 **/
window.addEventListener("DOMContentLoaded", () => new ToDoEase());