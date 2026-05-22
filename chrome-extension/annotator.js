/**
 * HoC Companion — Annotation Engine
 *
 * Canvas-based annotation tools: draw, highlight, arrow, text, blur/redact
 * with undo/redo stack. Used in both popup and content contexts.
 */

class AnnotationEngine {
  constructor(canvas, imageDataUrl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.imageDataUrl = imageDataUrl;
    this.activeTool = "draw";
    this.color = "#ef4444";
    this.size = 4;
    this.drawing = false;
    this.undoStack = [];
    this.redoStack = [];
    this.currentPath = [];
    this.startPos = null;
    this.img = null;
    this.textInput = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  async init() {
    return new Promise((resolve) => {
      this.img = new Image();
      // oxlint-disable-next-line prefer-add-event-listener
      this.img.onload = () => {
        // Fit canvas to image aspect ratio
        const maxW = this.canvas.parentElement?.clientWidth || 400;
        const scale = Math.min(1, maxW / this.img.width);
        this.canvas.width = this.img.width * scale;
        this.canvas.height = this.img.height * scale;
        this.scale = scale;
        this._drawBase();
        this._saveState();
        this._bind();
        resolve();
      };
      this.img.src = this.imageDataUrl;
    });
  }

  _bind() {
    this.canvas.addEventListener("mousedown", this._onMouseDown);
    this.canvas.addEventListener("mousemove", this._onMouseMove);
    this.canvas.addEventListener("mouseup", this._onMouseUp);
    this.canvas.addEventListener("mouseleave", this._onMouseUp);
  }

  unbind() {
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    this.canvas.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("mouseleave", this._onMouseUp);
  }

  setTool(tool) {
    this.activeTool = tool;
    this.canvas.style.cursor =
      tool === "text" ? "text" : "crosshair";
  }

  setColor(color) {
    this.color = color;
  }

  setSize(size) {
    this.size = parseInt(size, 10);
  }

  _drawBase() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
  }

  _getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  _saveState() {
    this.undoStack.push(
      this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    );
    this.redoStack = [];
    // Limit stack size
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
  }

  undo() {
    if (this.undoStack.length <= 1) {return;} // Keep base
    const current = this.undoStack.pop();
    this.redoStack.push(current);
    const prev = this.undoStack[this.undoStack.length - 1];
    this.ctx.putImageData(prev, 0, 0);
  }

  redo() {
    if (this.redoStack.length === 0) {return;}
    const next = this.redoStack.pop();
    this.undoStack.push(next);
    this.ctx.putImageData(next, 0, 0);
  }

  clear() {
    this._drawBase();
    this._saveState();
  }

  getDataUrl() {
    return this.canvas.toDataURL("image/png");
  }

  _onMouseDown(e) {
    const pos = this._getPos(e);
    this.drawing = true;
    this.startPos = pos;
    this.currentPath = [pos];

    if (this.activeTool === "text") {
      this._addTextAt(pos);
      this.drawing = false;
      return;
    }

    if (this.activeTool === "draw" || this.activeTool === "highlight") {
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      if (this.activeTool === "highlight") {
        this.ctx.globalAlpha = 0.35;
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.size * 6;
      } else {
        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.size;
      }
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
    }
  }

  _onMouseMove(e) {
    if (!this.drawing) {return;}
    const pos = this._getPos(e);
    this.currentPath.push(pos);

    if (this.activeTool === "draw" || this.activeTool === "highlight") {
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    }

    if (this.activeTool === "arrow" || this.activeTool === "blur") {
      // Redraw from last state to show preview
      const lastState = this.undoStack[this.undoStack.length - 1];
      this.ctx.putImageData(lastState, 0, 0);
      this._drawShape(this.startPos, pos);
    }
  }

  _onMouseUp(e) {
    if (!this.drawing) {return;}
    this.drawing = false;

    if (this.activeTool === "draw" || this.activeTool === "highlight") {
      this.ctx.globalAlpha = 1;
    }

    if ((this.activeTool === "arrow" || this.activeTool === "blur") && this.startPos) {
      const pos = this._getPos(e);
      const lastState = this.undoStack[this.undoStack.length - 1];
      this.ctx.putImageData(lastState, 0, 0);
      this._drawShape(this.startPos, pos);
    }

    this._saveState();
    this.startPos = null;
    this.currentPath = [];
  }

  _drawShape(start, end) {
    this.ctx.globalAlpha = 1;

    if (this.activeTool === "arrow") {
      this._drawArrow(start, end);
    }

    if (this.activeTool === "blur") {
      this._drawBlur(start, end);
    }
  }

  _drawArrow(from, to) {
    const headLen = 16;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = this.size;
    this.ctx.lineCap = "round";

    // Line
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();

    // Arrowhead
    this.ctx.fillStyle = this.color;
    this.ctx.beginPath();
    this.ctx.moveTo(to.x, to.y);
    this.ctx.lineTo(
      to.x - headLen * Math.cos(angle - Math.PI / 6),
      to.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      to.x - headLen * Math.cos(angle + Math.PI / 6),
      to.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  _drawBlur(from, to) {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);

    if (w < 2 || h < 2) {return;}

    // Pixelate region
    const pixelSize = 10;
    const imgData = this.ctx.getImageData(x, y, w, h);
    const data = imgData.data;

    for (let py = 0; py < h; py += pixelSize) {
      for (let px = 0; px < w; px += pixelSize) {
        const idx = (py * w + px) * 4;
        const r = data[idx] || 0;
        const g = data[idx + 1] || 0;
        const b = data[idx + 2] || 0;

        for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
          for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
            const i = ((py + dy) * w + (px + dx)) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }

    this.ctx.putImageData(imgData, x, y);

    // Draw border
    this.ctx.strokeStyle = "rgba(255,255,255,0.3)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, w, h);
  }

  _addTextAt(pos) {
    const text = prompt("Enter text:");
    if (!text) {return;}

    this.ctx.font = `${this.size * 4}px -apple-system, sans-serif`;
    this.ctx.fillStyle = this.color;
    this.ctx.textBaseline = "top";
    this.ctx.fillText(text, pos.x, pos.y);
    this._saveState();
  }
}

// Export for non-module contexts
if (typeof window !== "undefined") {
  window.AnnotationEngine = AnnotationEngine;
}
