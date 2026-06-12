const STORAGE_TASKS = "todo_tasks_mp_v1";

const viewTitle = {
  today: "我的今天",
  important: "重要",
  planned: "有提醒",
  done: "已完成"
};

function createId() {
  return `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function parseReminderTime(text, base) {
  const patterns = [
    /(今天|明天|后天)?\s*(上午|中午|下午|晚上|今晚)?\s*(\d{1,2})[:：](\d{2})/,
    /(今天|明天|后天)?\s*(上午|中午|下午|晚上|今晚)?\s*(\d{1,2})\s*[点时]\s*(半|(\d{1,2})分?)?/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const dateWord = match[1] || "";
    const period = match[2] || "";
    let hour = Number(match[3]);
    const minute = match[4] === "半" ? 30 : Number(match[4] || match[5] || 0);

    if (/下午|晚上|今晚/.test(period) && hour < 12) hour += 12;
    if (!period && hour > 0 && hour < 7) hour += 12;

    const date = new Date(base);
    date.setSeconds(0, 0);
    if (dateWord === "明天") date.setDate(date.getDate() + 1);
    if (dateWord === "后天") date.setDate(date.getDate() + 2);
    date.setHours(hour, minute, 0, 0);
    if (!dateWord && date.getTime() < base.getTime()) date.setDate(date.getDate() + 1);

    return { date, matchText: match[0] };
  }

  return null;
}

function parseTask(input) {
  const now = new Date();
  let title = String(input || "").trim();
  let reminderAt = "";
  const parsedTime = parseReminderTime(title, now);

  if (parsedTime) {
    reminderAt = parsedTime.date.getTime();
    title = title
      .replace(parsedTime.matchText, "")
      .replace(/提醒我|提醒|记得|到时候/g, "")
      .trim();
  }

  title = title.replace(/^(我今天|今天|我需要|我要|帮我|请)/, "").trim();

  return {
    title: title || "未命名任务",
    reminderAt
  };
}

function makeTask(input) {
  const parsed = parseTask(input);
  return {
    id: createId(),
    title: parsed.title,
    reminderAt: parsed.reminderAt,
    important: false,
    done: false,
    createdAt: Date.now(),
    notified: false
  };
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatReminder(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(now.getDate() + 1);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (sameDay(date, now)) return `今天 ${time}`;
  if (sameDay(date, tomorrow)) return `明天 ${time}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function toInputValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseInputDate(value) {
  if (!value) return "";
  const time = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isFinite(time) ? time : "";
}

Page({
  data: {
    view: "today",
    title: "我的今天",
    todayText: "",
    inputText: "",
    tasks: [],
    visibleTasks: [],
    bulk: false,
    selectedIds: [],
    editingId: "",
    editTitle: "",
    editReminder: "",
    counts: {
      today: 0,
      important: 0,
      planned: 0,
      done: 0
    }
  },

  onLoad() {
    const tasks = wx.getStorageSync(STORAGE_TASKS) || [
      makeTask("阅读产品资料"),
      makeTask("下午3点提醒我整理清单"),
      makeTask("晚上复盘")
    ];
    this.setData({
      tasks,
      todayText: this.getTodayText()
    });
    this.refresh();
  },

  onShow() {
    this.checkDueReminders();
  },

  getTodayText() {
    const d = new Date();
    const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
  },

  save() {
    wx.setStorageSync(STORAGE_TASKS, this.data.tasks);
  },

  switchView(event) {
    const view = event.currentTarget.dataset.view;
    this.setData({
      view,
      title: viewTitle[view],
      bulk: false,
      selectedIds: []
    });
    this.refresh();
  },

  onInput(event) {
    this.setData({ inputText: event.detail.value });
  },

  addTask() {
    const text = this.data.inputText.trim();
    if (!text) {
      wx.showToast({ title: "先写下一条任务", icon: "none" });
      return;
    }

    const tasks = [makeTask(text)].concat(this.data.tasks);
    this.setData({ tasks, inputText: "" });
    this.save();
    this.refresh();
    wx.showToast({ title: "已添加", icon: "none" });
  },

  getVisibleTasks() {
    const tasks = this.data.tasks.filter((task) => {
      if (this.data.view === "important") return task.important && !task.done;
      if (this.data.view === "planned") return task.reminderAt && !task.done;
      if (this.data.view === "done") return task.done;
      return !task.done;
    });

    return tasks.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.important !== b.important) return a.important ? -1 : 1;
      if (a.reminderAt && b.reminderAt) return a.reminderAt - b.reminderAt;
      if (a.reminderAt) return -1;
      if (b.reminderAt) return 1;
      return b.createdAt - a.createdAt;
    }).map((task) => ({
      ...task,
      reminderText: formatReminder(task.reminderAt),
      selected: this.data.selectedIds.includes(task.id)
    }));
  },

  refresh() {
    const todo = this.data.tasks.filter((task) => !task.done);
    this.setData({
      visibleTasks: this.getVisibleTasks(),
      counts: {
        today: todo.length,
        important: todo.filter((task) => task.important).length,
        planned: todo.filter((task) => task.reminderAt).length,
        done: this.data.tasks.filter((task) => task.done).length
      }
    });
  },

  toggleDone(event) {
    const id = event.currentTarget.dataset.id;
    const tasks = this.data.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task);
    this.setData({ tasks });
    this.save();
    this.refresh();
  },

  toggleImportant(event) {
    const id = event.currentTarget.dataset.id;
    const tasks = this.data.tasks.map((task) => task.id === id ? { ...task, important: !task.important } : task);
    this.setData({ tasks });
    this.save();
    this.refresh();
  },

  deleteTask(event) {
    const id = event.currentTarget.dataset.id;
    const tasks = this.data.tasks.filter((task) => task.id !== id);
    this.setData({ tasks });
    this.save();
    this.refresh();
  },

  toggleBulk() {
    this.setData({
      bulk: !this.data.bulk,
      selectedIds: []
    });
    this.refresh();
  },

  toggleSelected(event) {
    const id = event.currentTarget.dataset.id;
    const selectedIds = this.data.selectedIds.includes(id)
      ? this.data.selectedIds.filter((item) => item !== id)
      : this.data.selectedIds.concat(id);
    this.setData({ selectedIds });
    this.refresh();
  },

  selectAll() {
    const visibleIds = this.data.visibleTasks.map((task) => task.id);
    const allSelected = visibleIds.length && visibleIds.every((id) => this.data.selectedIds.includes(id));
    this.setData({ selectedIds: allSelected ? [] : visibleIds });
    this.refresh();
  },

  deleteSelected() {
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: "先选择任务", icon: "none" });
      return;
    }
    const selectedSet = new Set(this.data.selectedIds);
    const tasks = this.data.tasks.filter((task) => !selectedSet.has(task.id));
    this.setData({
      tasks,
      selectedIds: [],
      bulk: false
    });
    this.save();
    this.refresh();
  },

  openEdit(event) {
    const id = event.currentTarget.dataset.id;
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task) return;
    this.setData({
      editingId: id,
      editTitle: task.title,
      editReminder: toInputValue(task.reminderAt)
    });
  },

  closeEdit() {
    this.setData({
      editingId: "",
      editTitle: "",
      editReminder: ""
    });
  },

  editTitleInput(event) {
    this.setData({ editTitle: event.detail.value });
  },

  editReminderChange(event) {
    this.setData({ editReminder: event.detail.value });
  },

  saveEdit() {
    const tasks = this.data.tasks.map((task) => task.id === this.data.editingId ? {
      ...task,
      title: this.data.editTitle.trim() || "未命名任务",
      reminderAt: parseInputDate(this.data.editReminder),
      notified: false
    } : task);
    this.setData({ tasks });
    this.closeEdit();
    this.save();
    this.refresh();
  },

  clearReminder() {
    const tasks = this.data.tasks.map((task) => task.id === this.data.editingId ? {
      ...task,
      reminderAt: "",
      notified: false
    } : task);
    this.setData({ tasks });
    this.closeEdit();
    this.save();
    this.refresh();
  },

  addCalendar(event) {
    const id = event.currentTarget.dataset.id;
    const task = this.data.tasks.find((item) => item.id === id);
    if (!task || !task.reminderAt) {
      wx.showToast({ title: "请先设置提醒时间", icon: "none" });
      return;
    }
    if (typeof wx.addPhoneCalendar !== "function") {
      wx.showToast({ title: "当前微信版本不支持写入日历", icon: "none" });
      return;
    }
    wx.addPhoneCalendar({
      title: task.title,
      startTime: Math.floor(task.reminderAt / 1000),
      endTime: Math.floor(task.reminderAt / 1000) + 1800,
      description: `时间守护者待办：${task.title}`,
      alarm: true,
      success: () => wx.showToast({ title: "已加入日历", icon: "none" }),
      fail: () => wx.showToast({ title: "写入日历失败", icon: "none" })
    });
  },

  checkDueReminders() {
    const now = Date.now();
    let changed = false;
    const tasks = this.data.tasks.map((task) => {
      if (task.reminderAt && !task.done && !task.notified && task.reminderAt <= now) {
        changed = true;
        wx.showModal({
          title: "待办提醒",
          content: task.title,
          showCancel: false
        });
        return { ...task, notified: true };
      }
      return task;
    });
    if (changed) {
      this.setData({ tasks });
      this.save();
      this.refresh();
    }
  }
});
