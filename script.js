document.addEventListener("DOMContentLoaded", function () {
  const size = 9;
  const btn = document.getElementById("solve-btn");
  btn.addEventListener("click", handleSolve);

  const grid = document.getElementById("sudoku-grid");
  for (let r = 0; r < size; r++) {
    const row = document.createElement("tr");
    for (let c = 0; c < size; c++) {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      input.type = "number";
      input.className = "cell";
      input.id = `cell-${r}-${c}`;
      cell.appendChild(input);
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
});

async function handleSolve() {
  const dimension = 9;
  const board = [];

  for (let r = 0; r < dimension; r++) {
    board[r] = [];
    for (let c = 0; c < dimension; c++) {
      const cellID = `cell-${r}-${c}`;
      const value = document.getElementById(cellID).value;
      board[r][c] = value !== "" ? parseInt(value) : 0;
    }
  }

  for (let r = 0; r < dimension; r++) {
    for (let c = 0; c < dimension; c++) {
      const cellID = `cell-${r}-${c}`;
      const cellElement = document.getElementById(cellID);

      if (board[r][c] !== 0) {
        cellElement.classList.add("user-input");
      }
    }
  }

  if (sudokuSolver(board)) {
    for (let r = 0; r < dimension; r++) {
      for (let c = 0; c < dimension; c++) {
        const cellID = `cell-${r}-${c}`;
        const cellElement = document.getElementById(cellID);

        if (!cellElement.classList.contains("user-input")) {
          cellElement.value = board[r][c];
          cellElement.classList.add("solved");
          await pause(20);
        }
      }
    }
  } else {
    alert("No solution exists for the given Sudoku puzzle.");
  }
}

function sudokuSolver(board) {
  const dimension = 9;

  for (let r = 0; r < dimension; r++) {
    for (let c = 0; c < dimension; c++) {
      if (board[r][c] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isSafe(board, r, c, num)) {
            board[r][c] = num;

            if (sudokuSolver(board)) {
              return true;
            }

            board[r][c] = 0;
          }
        }
        return false;
      }
    }
  }

  return true;
}

function isSafe(board, row, col, num) {
  const dimension = 9;

  for (let i = 0; i < dimension; i++) {
    if (board[row][i] === num || board[i][col] === num) {
      return false;
    }
  }

  const startRow = Math.floor(row / 3) * 3;
  const startCol = Math.floor(col / 3) * 3;

  for (let i = startRow; i < startRow + 3; i++) {
    for (let j = startCol; j < startCol + 3; j++) {
      if (board[i][j] === num) {
        return false;
      }
    }
  }

  return true;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
