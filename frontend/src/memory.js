// src/memory.js
let history = [];
let currentClass = "class7"; // default

export default {
  addUser(message) {
    history.push({ role: "user", content: message });
  },
  addAssistant(message) {
    history.push({ role: "assistant", content: message });
  },
  getHistory() {
    return history;
  },
  clear() {
    history = [];
  },
  setClass(cls) {
    currentClass = cls;
  },
  getClass() {
    return currentClass;
  }
};