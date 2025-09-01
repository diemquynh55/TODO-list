const API_BASE = "todo-list-production-2556.up.railway.app"; // backend Express

const inputBox = document.getElementById("input-box");
const listContainer = document.getElementById("list-container");
const completedCounter = document.getElementById("completed-counter");
const uncompletedCounter = document.getElementById("uncompleted-counter");
const categorySelect = document.getElementById("category-select");

// Cập nhật counters
function updateCounters() {
  const completedTasks = listContainer.querySelectorAll(".completed").length;
  const uncompletedTasks =
    listContainer.querySelectorAll("li:not(.completed)").length;
  completedCounter.textContent = completedTasks;
  uncompletedCounter.textContent = uncompletedTasks;
}

// Render 1 task ra UI
function renderTask(task) {
  const li = document.createElement("li");
  li.dataset.id = task.id;
  li.innerHTML = `
  <label>
    <input type="checkbox" ${task.status ? "checked" : ""}>
    <span class="task-title">${task.title}</span>
  </label>
  <span class="category-label">${task.category_name || ""}</span>
  <button class="edit-btn">Edit</button>
  <button class="delete-btn">Delete</button>
  <span class="due-date">${
    task.due_date ? "📅 Deadline: " + task.due_date : ""
  }</span>
`;

  if (task.status) li.classList.add("completed");

  const checkbox = li.querySelector("input[type='checkbox']");
  const taskSpan = li.querySelector("label span");
  const editBtn = li.querySelector(".edit-btn");
  const deleteBtn = li.querySelector(".delete-btn");

  // Checkbox toggle
  checkbox.addEventListener("click", async () => {
    const checked = checkbox.checked ? 1 : 0;
    try {
      await fetch(`${API_BASE}/tasks/${li.dataset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: checked }),
      });
      li.classList.toggle("completed", !!checked);
      updateCounters();
    } catch (e) {
      alert("Update failed");
      checkbox.checked = !checked;
    }
  });

  // Edit
  editBtn.addEventListener("click", async () => {
    const current = taskSpan.textContent;
    const updated = prompt("Edit task:", current);
    if (updated !== null) {
      try {
        await fetch(`${API_BASE}/tasks/${li.dataset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: updated }),
        });
        taskSpan.textContent = updated;
        li.classList.remove("completed");
        checkbox.checked = false;
        updateCounters();
      } catch (e) {
        alert("Edit failed");
      }
    }
  });

  // Delete
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    try {
      await fetch(`${API_BASE}/tasks/${li.dataset.id}`, { method: "DELETE" });
      li.remove();
      updateCounters();
    } catch (e) {
      alert("Delete failed");
    }
  });

  listContainer.appendChild(li);
}

// Load tất cả tasks
async function loadTasks() {
  listContainer.innerHTML = "";
  const res = await fetch(`${API_BASE}/tasks`);
  const tasks = await res.json();
  tasks.forEach(renderTask);
  updateCounters();
}

// Load categories vào dropdown
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    const categories = await res.json();
    console.log("Categories from API:", categories);

    const select = document.getElementById("category-select");
    select.innerHTML =
      '<option value="" disabled selected hidden>Phân loại</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading categories:", err);
  }
}

// Thêm task mới
async function addTask() {
  const title = inputBox.value.trim();
  const category_id = categorySelect.value;
  const due_date = document.getElementById("due-date").value;

  if (!title) {
    alert("Please write down a task");
    return;
  }

  // ⚡ Kiểm tra deadline trước khi gửi request
  if (due_date) {
    const today = new Date().toISOString().split("T")[0];
    if (due_date < today) {
      alert("Deadline chỉ được phép từ hôm nay trở đi!");
      return; // ❌ chặn hẳn, không gửi API
    }
  }

  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category_id, due_date }), // gửi cả due_date
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.message || "Create failed");
      return;
    }

    const created = await res.json();
    renderTask(created);
    inputBox.value = "";
    document.getElementById("due-date").value = ""; // reset date
    updateCounters();
  } catch (e) {
    alert("Create failed");
  }
}

// Khi trang load
document.addEventListener("DOMContentLoaded", () => {
  loadTasks();
  loadCategories();
  // Set min cho deadline = hôm nay
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("due-date").setAttribute("min", today);
  // Enable drag & drop
  new Sortable(listContainer, {
    animation: 150,
    onEnd: async () => {
      const ids = [...listContainer.querySelectorAll("li")].map(
        (li) => li.dataset.id
      );
      try {
        await fetch(`${API_BASE}/tasks/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
      } catch (err) {
        console.error("Reorder failed:", err);
      }
    },
  });
});
