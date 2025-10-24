"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Grid3X3, 
  Plus, 
  Infinity, 
  Globe, 
  Bookmark, 
  Moon, 
  Calendar, 
  Building2,
  Star,
  Clock,
  Shuffle,
  Search,
  Filter,
  Play,
  CheckCircle,
  Circle,
  BookmarkCheck,
  X
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import TaskInstructionNew from "./components/TaskInstructionNew";
import CodingEditor from "./components/CodingEditor";
import MinimalTaskList from "./components/MinimalTaskList";
import MultiFileEditor from "./components/MultiFileEditor";

export default function Home() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTasks, setFilteredTasks] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [theme, setTheme] = useState<'native' | 'light' | 'dark'>('dark');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showCodingTerminal, setShowCodingTerminal] = useState(false);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [hasStartedTask, setHasStartedTask] = useState(false);
  
  // Vibe page layout state
  const [code, setCode] = useState("");
  const [editorHeight, setEditorHeight] = useState(0);
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [logProbs, setLogProbs] = useState<any>(null);
  const [messageAIIndex, setMessageAIIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const editorRef = useRef<any>(null);
  const actualEditorRef = useRef<any>(null);
  const chatRef = useRef<any>(null);
  
  // Resize state
  const [leftColumnWidth, setLeftColumnWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [taskInstructionHeight, setTaskInstructionHeight] = useState(0);
  const [isVerticalResizing, setIsVerticalResizing] = useState(false);
  const [isEditorResizing, setIsEditorResizing] = useState(false);
  
  // Pane visibility
  const [showTaskInstructions, setShowTaskInstructions] = useState(true);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  
  // Task data
  const [taskDescriptions, setTaskDescriptions] = useState<string[]>([]);
  const [initialFiles, setInitialFiles] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);

  // Initialize layout with 50/50 split
  useEffect(() => {
    const viewportWidth = window.innerWidth - 32;
    const viewportHeight = window.innerHeight - 32;
    const halfWidth = viewportWidth * 0.5;
    const halfHeight = viewportHeight * 0.5;
    
    setLeftColumnWidth(halfWidth);
    setTaskInstructionHeight(halfHeight);
    setEditorHeight(halfHeight);
  }, []);

  // Resize handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVerticalResizing(true);
  };

  const handleEditorMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsEditorResizing(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    
    const containerWidth = window.innerWidth - 32;
    const resizeHandleWidth = 16;
    const padding = 16;
    
    const relativeX = e.clientX - padding;
    const newLeftWidth = relativeX;
    
    const minWidthPercent = 25;
    const minWidth = (containerWidth * minWidthPercent) / 100;
    const rightMinWidth = (containerWidth * 30) / 100; // RIGHT_MIN_WIDTH_PERCENT
    const maxWidth = Math.max(minWidth, containerWidth - rightMinWidth - resizeHandleWidth);
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newLeftWidth));
    setLeftColumnWidth(constrainedWidth);
  };

  const handleVerticalMouseMove = (e: MouseEvent) => {
    if (!isVerticalResizing) return;
    
    const containerHeight = window.innerHeight - 32;
    const resizeHandleHeight = 16;
    const padding = 16;
    
    const relativeY = e.clientY - padding;
    const newTaskHeight = relativeY;
    
    const minHeightPercent = 25;
    const maxHeightPercent = 75;
    const minHeight = (containerHeight * minHeightPercent) / 100;
    const maxHeight = (containerHeight * maxHeightPercent) / 100;
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newTaskHeight));
    setTaskInstructionHeight(constrainedHeight);
  };

  const handleEditorMouseMove = (e: MouseEvent) => {
    if (!isEditorResizing) return;
    
    const containerHeight = window.innerHeight - 32;
    const resizeHandleHeight = 16;
    const padding = 16;
    
    const relativeY = e.clientY - padding;
    const newEditorHeight = relativeY;
    
    const minHeightPercent = 20;
    const maxHeightPercent = 70;
    const minHeight = (containerHeight * minHeightPercent) / 100;
    const maxHeight = (containerHeight * maxHeightPercent) / 100;
    const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newEditorHeight));
    setEditorHeight(constrainedHeight);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
    setIsVerticalResizing(false);
    setIsEditorResizing(false);
    try {
      (actualEditorRef.current as any)?.layout?.();
    } catch (e) {
      // no-op
    }
  };

  // Add global mouse event listeners
  useEffect(() => {
    if (isResizing || isVerticalResizing || isEditorResizing) {
      let mouseMoveHandler: (e: MouseEvent) => void;
      if (isResizing) mouseMoveHandler = handleMouseMove;
      else if (isVerticalResizing) mouseMoveHandler = handleVerticalMouseMove;
      else if (isEditorResizing) mouseMoveHandler = handleEditorMouseMove;
      else return;
      
      document.addEventListener('mousemove', mouseMoveHandler);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizing ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mousemove', handleEditorMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mousemove', handleEditorMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, isVerticalResizing, isEditorResizing]);

  // Generate initial files for each task type
  const getInitialFilesForTask = (taskId: string) => {
    switch (taskId) {
      case "tic-tac-toe":
        return [
          {
            id: "index.html",
            name: "index.html",
            type: "file" as const,
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tic Tac Toe</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Tic Tac Toe</h1>
        <div id="game-status">Player X's turn</div>
        <div class="game-board">
            <div class="cell" id="cell-0-0" data-row="0" data-col="0"></div>
            <div class="cell" id="cell-0-1" data-row="0" data-col="1"></div>
            <div class="cell" id="cell-0-2" data-row="0" data-col="2"></div>
            <div class="cell" id="cell-1-0" data-row="1" data-col="0"></div>
            <div class="cell" id="cell-1-1" data-row="1" data-col="1"></div>
            <div class="cell" id="cell-1-2" data-row="1" data-col="2"></div>
            <div class="cell" id="cell-2-0" data-row="2" data-col="0"></div>
            <div class="cell" id="cell-2-1" data-row="2" data-col="1"></div>
            <div class="cell" id="cell-2-2" data-row="2" data-col="2"></div>
        </div>
        <button id="play-again-btn" style="display: none;">Play Again</button>
    </div>
    <script src="script.js"></script>
</body>
</html>`
          },
          {
            id: "style.css",
            name: "style.css",
            type: "file" as const,
            content: `body {
    font-family: Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    background-color: #f0f0f0;
}

.container {
    text-align: center;
}

h1 {
    color: #333;
    margin-bottom: 20px;
}

#game-status {
    font-size: 18px;
    margin-bottom: 20px;
    font-weight: bold;
}

.game-board {
    display: grid;
    grid-template-columns: repeat(3, 100px);
    grid-template-rows: repeat(3, 100px);
    gap: 5px;
    margin: 20px auto;
    justify-content: center;
}

.cell {
    background-color: white;
    border: 2px solid #333;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.3s;
}

.cell:hover {
    background-color: #e0e0e0;
}

.cell.x {
    color: #e74c3c;
}

.cell.o {
    color: #3498db;
}

#play-again-btn {
    padding: 10px 20px;
    font-size: 16px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin-top: 20px;
}

#play-again-btn:hover {
    background-color: #2980b9;
}`
          },
          {
            id: "script.js",
            name: "script.js",
            type: "file" as const,
            content: `// Game state
let currentPlayer = 'X';
let gameBoard = ['', '', '', '', '', '', '', '', ''];
let gameActive = true;

// DOM elements
const cells = document.querySelectorAll('.cell');
const gameStatus = document.getElementById('game-status');
const playAgainBtn = document.getElementById('play-again-btn');

// Initialize game
function initGame() {
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
    playAgainBtn.addEventListener('click', resetGame);
}

// Handle cell click
function handleCellClick(event) {
    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const index = row * 3 + col;

    if (gameBoard[index] !== '' || !gameActive) {
        return;
    }

    // Make move
    gameBoard[index] = currentPlayer;
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase());

    // Check for winner
    if (checkWinner()) {
        gameStatus.textContent = \`Player \${currentPlayer} wins!\`;
        gameActive = false;
        playAgainBtn.style.display = 'block';
        return;
    }

    // Check for tie
    if (gameBoard.every(cell => cell !== '')) {
        gameStatus.textContent = "It's a tie!";
        gameActive = false;
        playAgainBtn.style.display = 'block';
        return;
    }

    // Switch player
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    gameStatus.textContent = \`Player \${currentPlayer}'s turn\`;
}

// Check for winner
function checkWinner() {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6] // Diagonals
    ];

    return winPatterns.some(pattern => {
        const [a, b, c] = pattern;
        return gameBoard[a] && gameBoard[a] === gameBoard[b] && gameBoard[a] === gameBoard[c];
    });
}

// Reset game
function resetGame() {
    currentPlayer = 'X';
    gameBoard = ['', '', '', '', '', '', '', '', ''];
    gameActive = true;
    
    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
    });
    
    gameStatus.textContent = "Player X's turn";
    playAgainBtn.style.display = 'none';
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', initGame);`
          }
        ];
      case "todo-app":
        return [
          {
            id: "index.html",
            name: "index.html",
            type: "file" as const,
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo App</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Todo App</h1>
        <div class="input-section">
            <input type="text" id="todo-input" placeholder="Add a new todo...">
            <button id="add-btn">Add</button>
        </div>
        <div class="filter-section">
            <button class="filter-btn active" data-filter="all">All</button>
            <button class="filter-btn" data-filter="active">Active</button>
            <button class="filter-btn" data-filter="completed">Completed</button>
        </div>
        <div class="stats">
            <span id="total-count">Total: 0</span>
            <span id="active-count">Active: 0</span>
            <span id="completed-count">Completed: 0</span>
        </div>
        <ul id="todo-list"></ul>
        <button id="clear-completed" style="display: none;">Clear Completed</button>
    </div>
    <script src="script.js"></script>
</body>
</html>`
          },
          {
            id: "style.css",
            name: "style.css",
            type: "file" as const,
            content: `body {
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    background-color: #f5f5f5;
}

.container {
    background: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
    text-align: center;
    color: #333;
    margin-bottom: 30px;
}

.input-section {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

#todo-input {
    flex: 1;
    padding: 12px;
    border: 2px solid #ddd;
    border-radius: 5px;
    font-size: 16px;
}

#add-btn {
    padding: 12px 20px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
}

#add-btn:hover {
    background-color: #0056b3;
}

.filter-section {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.filter-btn {
    padding: 8px 16px;
    border: 1px solid #ddd;
    background: white;
    cursor: pointer;
    border-radius: 5px;
}

.filter-btn.active {
    background-color: #007bff;
    color: white;
}

.stats {
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
    font-size: 14px;
    color: #666;
}

#todo-list {
    list-style: none;
    padding: 0;
}

.todo-item {
    display: flex;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #eee;
    gap: 10px;
}

.todo-item.completed {
    opacity: 0.6;
}

.todo-item.completed .todo-text {
    text-decoration: line-through;
}

.todo-checkbox {
    width: 20px;
    height: 20px;
}

.todo-text {
    flex: 1;
    font-size: 16px;
}

.todo-actions {
    display: flex;
    gap: 5px;
}

.edit-btn, .delete-btn {
    padding: 5px 10px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
}

.edit-btn {
    background-color: #ffc107;
    color: #333;
}

.delete-btn {
    background-color: #dc3545;
    color: white;
}

#clear-completed {
    width: 100%;
    padding: 10px;
    background-color: #dc3545;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin-top: 20px;
}

#clear-completed:hover {
    background-color: #c82333;
}`
          },
          {
            id: "script.js",
            name: "script.js",
            type: "file" as const,
            content: `// Todo App JavaScript
let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all';

// DOM elements
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clear-completed');
const totalCount = document.getElementById('total-count');
const activeCount = document.getElementById('active-count');
const completedCount = document.getElementById('completed-count');

// Initialize app
function init() {
    addBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });
    
    clearCompletedBtn.addEventListener('click', clearCompleted);
    
    renderTodos();
    updateStats();
}

// Add new todo
function addTodo() {
    const text = todoInput.value.trim();
    if (!text) return;
    
    const todo = {
        id: Date.now(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    todos.push(todo);
    todoInput.value = '';
    saveTodos();
    renderTodos();
    updateStats();
}

// Toggle todo completion
function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodos();
        renderTodos();
        updateStats();
    }
}

// Edit todo
function editTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    const newText = prompt('Edit todo:', todo.text);
    if (newText !== null && newText.trim()) {
        todo.text = newText.trim();
        saveTodos();
        renderTodos();
    }
}

// Delete todo
function deleteTodo(id) {
    if (confirm('Are you sure you want to delete this todo?')) {
        todos = todos.filter(t => t.id !== id);
        saveTodos();
        renderTodos();
        updateStats();
    }
}

// Set filter
function setFilter(filter) {
    currentFilter = filter;
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderTodos();
}

// Clear completed todos
function clearCompleted() {
    if (confirm('Are you sure you want to clear all completed todos?')) {
        todos = todos.filter(t => !t.completed);
        saveTodos();
        renderTodos();
        updateStats();
    }
}

// Render todos based on current filter
function renderTodos() {
    const filteredTodos = todos.filter(todo => {
        switch (currentFilter) {
            case 'active': return !todo.completed;
            case 'completed': return todo.completed;
            default: return true;
        }
    });
    
    todoList.innerHTML = filteredTodos.map(todo => \`
        <li class="todo-item \${todo.completed ? 'completed' : ''}">
            <input type="checkbox" class="todo-checkbox" \${todo.completed ? 'checked' : ''} 
                   onchange="toggleTodo(\${todo.id})">
            <span class="todo-text">\${escapeHtml(todo.text)}</span>
            <div class="todo-actions">
                <button class="edit-btn" onclick="editTodo(\${todo.id})">Edit</button>
                <button class="delete-btn" onclick="deleteTodo(\${todo.id})">Delete</button>
            </div>
        </li>
    \`).join('');
    
    clearCompletedBtn.style.display = todos.some(t => t.completed) ? 'block' : 'none';
}

// Update statistics
function updateStats() {
    const total = todos.length;
    const active = todos.filter(t => !t.completed).length;
    const completed = todos.filter(t => t.completed).length;
    
    totalCount.textContent = \`Total: \${total}\`;
    activeCount.textContent = \`Active: \${active}\`;
    completedCount.textContent = \`Completed: \${completed}\`;
}

// Save todos to localStorage
function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', init);`
          }
        ];
      default:
        return [
          {
            id: "index.html",
            name: "index.html",
            type: "file" as const,
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Project</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <h1>Welcome to Your Project</h1>
        <p>Start building your amazing application!</p>
    </div>
    <script src="script.js"></script>
</body>
</html>`
          },
          {
            id: "style.css",
            name: "style.css",
            type: "file" as const,
            content: `body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f5f5f5;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    background: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
    color: #333;
    text-align: center;
}`
          },
          {
            id: "script.js",
            name: "script.js",
            type: "file" as const,
            content: `// Your JavaScript code goes here
console.log('Hello, World!');`
          }
        ];
    }
  };

  // Helper functions to get task data
  const getTaskRequirements = (taskId: string): string[] => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.requirements || [];
  };

  const getTaskVideoDemo = (taskId: string): string | undefined => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.videoDemo;
  };

  const getTaskDescription = (taskId: string): string => {
    const task = allTasks.find(t => t.id === taskId);
    return task?.description || "";
  };

  // Handle task selection
  const handleTaskSelect = (taskId: string) => {
    setSelectedTask(taskId);
    setShowCodingTerminal(true);
    
    // Set task description
    const description = getTaskDescription(taskId);
    setTaskDescriptions([description]);
    
    // Set initial files
    const files = getInitialFilesForTask(taskId);
    setInitialFiles(files);
    
    // Reset layout to 50/50 split
    const viewportWidth = window.innerWidth - 32;
    const viewportHeight = window.innerHeight - 32;
    const halfWidth = viewportWidth * 0.5;
    const halfHeight = viewportHeight * 0.5;
    
    setLeftColumnWidth(halfWidth);
    setTaskInstructionHeight(halfHeight);
    setEditorHeight(halfHeight);
  };

  // Editor mount handler
  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  // Filter tasks based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredTasks(allTasks);
    } else {
      const filtered = allTasks.filter(task =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.tags.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      setFilteredTasks(filtered);
    }
  }, [searchQuery]);

  // Full task list
  const allTasks = [
    {
      id: "tic-tac-toe",
      name: "Tic Tac Toe",
      description: "Build an interactive tic-tac-toe game where humans (playing as \"X\") compete against an AI opponent (playing as \"O\"). The game should have a clean 3x3 grid interface with proper game state management and AI logic.",
      difficulty: "Beginner",
      appType: "Game",
      estimatedTime: "30 min",
      tags: ["HTML", "CSS", "JavaScript", "Python"],
      preview: "🎮",
      status: "completed",
      saved: true,
      videoDemo: "/api/video/tictactoe_solution/demo.mp4",
      requirements: [
        "Create a 3x3 grid board with clickable cells",
        "Implement human vs AI gameplay (Human = X, AI = O)",
        "Display game status showing whose turn it is or game over state",
        "Implement win detection for rows, columns, and diagonals",
        "Handle tie games when board is full",
        "Add play again functionality to reset the game",
        "AI should prioritize winning moves, then blocking human wins, then random valid moves",
        "Use specific element IDs for testing: #game-status, #cell-{row}-{col}, #play-again-btn",
        "Backend API endpoints: /check_winner, /play_move, /ai_move, /reset",
        "Frontend should call backend via callAPI() function for all game logic"
      ]
    },
    {
      id: "todo-app",
      name: "Todo App",
      description: "Create a fully functional todo application that allows users to manage their daily tasks with a clean and intuitive interface. Users should be able to add new todos, mark them as complete, edit existing todos, and delete unwanted items.",
      difficulty: "Beginner",
      appType: "Widget",
      estimatedTime: "45 min",
      tags: ["HTML", "CSS", "JavaScript"],
      preview: "📝",
      status: "in-progress",
      saved: false,
      videoDemo: "todo-demo.mp4",
      requirements: [
        "Display a list of todo items with checkboxes for completion status",
        "Add new todo items through an input field and submit button",
        "Mark todos as complete/incomplete by clicking checkboxes",
        "Edit existing todo text by double-clicking or using an edit button",
        "Delete todos with a delete button or trash icon",
        "Show count of total, completed, and remaining todos",
        "Filter todos by status (all, active, completed)",
        "Clear all completed todos with a single button",
        "Persist todo data in localStorage",
        "Responsive design that works on mobile and desktop"
      ]
    },
    {
      id: "weather-dashboard",
      name: "Weather Dashboard",
      description: "Build a comprehensive weather dashboard that provides current weather conditions and multi-day forecasts for any location. The dashboard should display temperature, humidity, wind speed, and weather conditions with an intuitive and visually appealing interface.",
      difficulty: "Intermediate",
      appType: "Widget",
      estimatedTime: "60 min",
      tags: ["React", "API", "CSS"],
      preview: "🌤️",
      status: "not-started",
      saved: true,
      videoDemo: "weather-demo.mp4",
      requirements: [
        "Search for weather by city name or coordinates",
        "Display current temperature, humidity, wind speed, and weather conditions",
        "Show weather icons representing current conditions",
        "Display 5-day weather forecast with daily highs/lows",
        "Include weather descriptions (sunny, cloudy, rainy, etc.)",
        "Show location name and current date/time",
        "Handle API errors gracefully with user-friendly messages",
        "Responsive design that works on all screen sizes",
        "Loading states while fetching weather data",
        "Optional: Add temperature unit toggle (Celsius/Fahrenheit)"
      ]
    },
    {
      id: "chat-application",
      name: "Chat Application",
      description: "Develop a real-time chat application that enables users to communicate instantly with features like user authentication, message history, and real-time updates. The application should support multiple users and provide a smooth messaging experience.",
      difficulty: "Advanced",
      appType: "Widget",
      estimatedTime: "90 min",
      tags: ["React", "Node.js", "WebSocket", "Auth"],
      preview: "💬",
      status: "not-started",
      saved: false,
      videoDemo: "chat-demo.mp4",
      requirements: [
        "User registration and login system with authentication",
        "Real-time message sending and receiving",
        "Display message history with timestamps",
        "Show online/offline status of users",
        "Message notifications for new messages",
        "User profile management (username, avatar)",
        "Chat rooms or channels functionality",
        "Message editing and deletion capabilities",
        "Typing indicators when users are composing messages",
        "Responsive design for mobile and desktop use"
      ]
    },
    {
      id: "calculator",
      name: "Calculator",
      description: "Build a fully functional calculator with basic and advanced operations. Practice JavaScript math operations and UI design.",
      difficulty: "Beginner",
      appType: "Widget",
      estimatedTime: "25 min",
      tags: ["HTML", "CSS", "JavaScript"],
      preview: "🧮",
      status: "completed",
      saved: true,
      videoDemo: "calculator-demo.mp4",
      requirements: [
        "Display screen showing current number and operations",
        "Number buttons (0-9) for input",
        "Basic operations: +, -, ×, ÷",
        "Equals button to calculate results",
        "Clear button to reset calculator",
        "Handle decimal numbers",
        "Prevent division by zero",
        "Responsive design for mobile and desktop",
        "Keyboard support for number and operation keys",
        "Visual feedback for button presses"
      ]
    },
    {
      id: "note-taker",
      name: "Note Taker",
      description: "Build a minimal notes app with local persistence. Learn data storage and basic CRUD operations.",
      difficulty: "Beginner",
      appType: "Widget",
      estimatedTime: "35 min",
      tags: ["HTML", "CSS", "JavaScript"],
      preview: "🗒️",
      status: "not-started",
      saved: false,
      videoDemo: "note-taker-demo.mp4",
      requirements: [
        "Create new notes with title and content",
        "Save notes to localStorage",
        "Display list of all saved notes",
        "Edit existing notes",
        "Delete notes with confirmation",
        "Search/filter notes by title or content",
        "Auto-save functionality",
        "Responsive design",
        "Markdown support for note content",
        "Export notes as text files"
      ]
    },
    {
      id: "image-gallery",
      name: "Image Gallery",
      description: "Responsive gallery with lightbox and keyboard navigation. Master CSS Grid, Flexbox, and JavaScript DOM manipulation.",
      difficulty: "Intermediate",
      appType: "Widget",
      estimatedTime: "50 min",
      tags: ["React", "CSS"],
      preview: "🖼️",
      status: "not-started",
      saved: false,
      videoDemo: "image-gallery-demo.mp4",
      requirements: [
        "Display images in responsive grid layout",
        "Lightbox modal for full-size image viewing",
        "Keyboard navigation (arrow keys, escape)",
        "Image lazy loading for performance",
        "Smooth transitions and animations",
        "Touch/swipe support for mobile",
        "Image zoom functionality",
        "Gallery navigation (previous/next)",
        "Image metadata display (title, description)",
        "Responsive design for all screen sizes"
      ]
    },
    {
      id: "markdown-viewer",
      name: "Markdown Viewer",
      description: "Render markdown input with live preview. Learn text processing and real-time content updates.",
      difficulty: "Intermediate",
      appType: "Widget",
      estimatedTime: "55 min",
      tags: ["React", "Markdown"],
      preview: "📝",
      status: "not-started",
      saved: false,
      videoDemo: "markdown-viewer-demo.mp4",
      requirements: [
        "Split-screen editor and preview",
        "Real-time markdown rendering",
        "Support for headers, lists, links, images",
        "Code syntax highlighting",
        "Table support",
        "Export to HTML/PDF",
        "Save/load markdown files",
        "Dark/light theme toggle",
        "Word count and character statistics",
        "Responsive design for mobile editing"
      ]
    },
    {
      id: "pomodoro",
      name: "Pomodoro Timer",
      description: "Timer with sessions, breaks, and notifications. Practice time management concepts and JavaScript intervals.",
      difficulty: "Beginner",
      appType: "Widget",
      estimatedTime: "30 min",
      tags: ["JavaScript", "CSS"],
      preview: "⏱️",
      status: "in-progress",
      saved: true,
      videoDemo: "pomodoro-demo.mp4",
      requirements: [
        "25-minute work timer",
        "5-minute short break timer",
        "15-minute long break timer",
        "Start, pause, and reset functionality",
        "Visual progress indicator",
        "Audio notifications when timer ends",
        "Session counter tracking",
        "Customizable timer durations",
        "Background timer continues when tab is inactive",
        "Responsive design for mobile use"
      ]
    },
    {
      id: "expense-tracker",
      name: "Expense Tracker",
      description: "Track expenses with charts and filtering. Learn data visualization and complex state management.",
      difficulty: "Intermediate",
      appType: "Widget",
      estimatedTime: "70 min",
      tags: ["React", "Chart"],
      preview: "📊",
      status: "not-started",
      saved: false,
      videoDemo: "expense-tracker-demo.mp4",
      requirements: [
        "Add, edit, and delete expense entries",
        "Categorize expenses (food, transport, entertainment, etc.)",
        "Visual charts showing spending patterns",
        "Filter expenses by date range and category",
        "Monthly and yearly spending summaries",
        "Budget setting and tracking",
        "Export data to CSV",
        "Data persistence in localStorage",
        "Responsive charts for mobile",
        "Dark/light theme support"
      ]
    },
    {
      id: "wiki-search",
      name: "Wiki Search",
      description: "Search Wikipedia with debounced queries. Master API integration and search functionality.",
      difficulty: "Beginner",
      appType: "Widget",
      estimatedTime: "40 min",
      tags: ["React", "API"],
      preview: "🔎",
      status: "completed",
      saved: true,
      videoDemo: "wiki-search-demo.mp4",
      requirements: [
        "Search Wikipedia articles by keyword",
        "Debounced search input (wait for user to stop typing)",
        "Display search results with titles and snippets",
        "Click to view full Wikipedia article",
        "Handle API errors gracefully",
        "Loading states during search",
        "Search history functionality",
        "Responsive design for mobile",
        "Keyboard navigation support",
        "Clear search functionality"
      ]
    }
  ];

  // Initialize filtered tasks
  useEffect(() => {
    setFilteredTasks(allTasks);
  }, []);

  // Keyboard shortcut for sidebar toggle (Tab when not typing)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;
      if (isTyping) return;

      // Tab: Toggle sidebar whenever user isn't typing (prevents focus navigation)
      if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'Tab') {
        event.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTaskClick = (taskId: string) => {
    router.push(`/vibe/${taskId}`);
  };

  const handleRandomTask = () => {
    const randomIndex = Math.floor(Math.random() * allTasks.length);
    const randomTask = allTasks[randomIndex];
    router.push(`/vibe/${randomTask.id}`);
  };

  const handleSaveToggle = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent task click
    // Update the task's saved status
    const updatedTasks = filteredTasks.map(task => 
      task.id === taskId ? { ...task, saved: !task.saved } : task
    );
    setFilteredTasks(updatedTasks);
  };

  const handleGetStarted = (taskId: string) => {
    setSelectedTask(taskId);
    setShowCodingTerminal(true);
    setHasStartedTask(true);
    // Ensure the task stays expanded when starting coding
    if (expandedTask !== taskId) {
      setExpandedTask(taskId);
    }
  };

  const handleGoBack = () => {
    setExpandedTask(null);
    setShowCodingTerminal(false);
    setSelectedTask(null);
    setHasStartedTask(false);
  };

  const handleTaskExpand = (taskId: string) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
    } else {
      setExpandedTask(taskId);
    }
  };

  // Helper function to get status icon (LeetCode style)
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <div className="relative">
            <CheckCircle className="peer h-5 w-5 text-green-500 hover:text-green-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
              Submitted
            </div>
          </div>
        );
      case "in-progress":
        return (
          <div className="relative">
            <div className="peer h-5 w-5 relative hover:scale-110 transition-transform cursor-help">
              <Circle className="h-5 w-5 text-white hover:text-blue-300 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-0.5 bg-white"></div>
              </div>
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
              In Progress
            </div>
          </div>
        );
      case "not-started":
      default:
        return (
          <div className="relative">
            <Circle className="peer h-5 w-5 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
              Not Started
            </div>
          </div>
        );
    }
  };

  // Helper function to get save icon with tooltip (LeetCode style)
  const getSaveIcon = (saved: boolean) => {
    return (
      <div className="relative">
        {saved ? (
          <Star className="peer h-4 w-4 text-yellow-400 fill-current hover:text-yellow-300 transition-colors cursor-help" />
        ) : (
          <Star className="peer h-4 w-4 text-gray-500 hover:text-gray-400 transition-colors cursor-help" />
        )}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 peer-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50 pointer-events-none border border-gray-700">
          {saved ? "Remove from saved" : "Save task"}
        </div>
      </div>
    );
  };

  // Helper function to get difficulty color
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-400";
      case "Intermediate":
        return "text-yellow-400";
      case "Advanced":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  // Helper function to get difficulty badge colors (LeetCode style)
  const getDifficultyBadgeColors = (difficulty: string) => {
    switch (difficulty) {
      case "Beginner":
        return "text-green-400";
      case "Intermediate":
        return "text-orange-400";
      case "Advanced":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  // Helper function to get app type badge colors
  const getAppTypeBadgeColors = (appType: string) => {
    switch (appType) {
      case "Game":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "Widget":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onThemeChange={setTheme}
      />

      {/* Main Content */}
      <div className={`transition-all duration-300 ease-in-out ${sidebarOpen ? 'ml-64' : 'ml-16'} flex h-screen overflow-hidden`}>
        {/* Left Side - Task List */}
        <div className={`flex flex-col p-8 ${showCodingTerminal ? 'w-1/2' : 'w-full'} transition-all duration-300 min-w-0`}>
          {/* Header - only show when no task is expanded and no coding terminal */}
          {!expandedTask && !showCodingTerminal && (
            <div className="mb-8">
              <h1 className="text-4xl font-light mb-2">
                What do you want to build on {" "}
                <span className="animated-gradient font-semibold">
                  Vibe Code Arena
                </span>
                ?
              </h1>
            </div>
          )}

          {/* Search Bar - only show when no task is expanded and no coding terminal */}
          {!expandedTask && !showCodingTerminal && (
            <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
              <div className="relative flex-1 max-w-md w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search problems..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-600 rounded-lg bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex items-center space-x-4 flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <button className="p-2 rounded-lg bg-gray-800 border border-gray-600 hover:bg-gray-700 transition-colors">
                    <Filter className="h-4 w-4 text-gray-400" />
                  </button>
                  <span className="text-sm text-gray-400 whitespace-nowrap">
                    {filteredTasks.length} problems
                  </span>
                </div>
                
                <button 
                  onClick={handleRandomTask}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 whitespace-nowrap"
                >
                  <Shuffle size={14} />
                  <span>Random</span>
                </button>
              </div>
            </div>
          )}

          {/* Task List */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
            <MinimalTaskList
              tasks={expandedTask || showCodingTerminal ? [allTasks.find(t => t.id === (expandedTask || selectedTask))].filter(Boolean) : filteredTasks}
              onSaveToggle={handleSaveToggle}
              onGetStarted={handleGetStarted}
              expandedTask={expandedTask || selectedTask}
              onTaskExpand={handleTaskExpand}
              onGoBack={handleGoBack}
              hasStartedTask={hasStartedTask}
              disableHover={showCodingTerminal}
            />
          </div>

          {/* No results message - only show when no task is expanded and no coding terminal */}
          {!expandedTask && !showCodingTerminal && filteredTasks.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 text-lg">No tasks found matching your search.</p>
              <button 
                onClick={() => setSearchQuery("")}
                className="mt-4 text-blue-400 hover:text-blue-300 transition-colors"
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {/* Right Side - Coding Terminal */}
        {showCodingTerminal && selectedTask && (
          <div className="w-1/2 border-l border-gray-700 bg-gray-900">
            <div className="h-full flex flex-col">
              {/* Terminal Header */}
              <div className="p-4 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    {allTasks.find(t => t.id === selectedTask)?.name || 'Coding Terminal'}
                  </h2>
                  <button
                    onClick={() => {
                      setShowCodingTerminal(false);
                      setSelectedTask(null);
                    }}
                    className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Coding Editor */}
              <div className="flex-1">
                <MultiFileEditor
                  onEditorMount={handleEditorMount}
                  contextLength={4000}
                  wait_time_for_sug={2000}
                  setSuggestionIdx={setSuggestionIdx}
                  setTelemetry={setTelemetry}
                  modelAutocomplete="gpt-4"
                  taskIndex={0}
                  setLogprobsCompletion={setLogProbs}
                  logProbs={logProbs}
                  suggestionIdx={suggestionIdx}
                  messageAIIndex={messageAIIndex}
                  setIsSpinning={setIsSpinning}
                  proactive_refresh_time_inactive={5000}
                  chatRef={chatRef}
                  actualEditorRef={editorRef}
                  code={code}
                  setCode={setCode}
                  editorHeight={editorHeight}
                  onEditorMouseDown={handleEditorMouseDown}
                  initialFiles={getInitialFilesForTask(selectedTask)}
                  readOnly={false}
                  onFileSave={(fileId: string) => {
                    console.log('File saved:', fileId);
                    // Add any file save logic here
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}