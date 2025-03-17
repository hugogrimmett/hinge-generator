class BoxRenderer {
    constructor(canvas, h, w, d, alpha, g) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Calculate viewport bounds and scale
        const margin = Math.max(h, w) * 0.1;  // 10% margin
        this.viewportBounds = {
            left: -margin,
            right: w + margin,
            bottom: -margin,
            top: 2 * h + margin  // Need space for open lid
        };
        
        // Calculate scale to fit viewport in canvas
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        this.scale = Math.min(
            canvas.width * 0.9 / viewportWidth,
            canvas.height * 0.9 / viewportHeight
        );
        
        // Calculate offset to center viewport
        this.offset = {
            x: canvas.width/2 - (this.viewportBounds.left + viewportWidth/2) * this.scale,
            y: canvas.height/2 + (this.viewportBounds.bottom + viewportHeight/2) * this.scale
        };

        // Set up interaction state
        this.isDragging = false;
        this.selectedPoint = null;

        // Add event listeners
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

        // Initial draw
        this.draw();
    }
    
    updateParameters(h, w, d, alpha, g) {
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Recalculate viewport bounds and scale
        const margin = Math.max(h, w) * 0.1;
        this.viewportBounds = {
            left: -margin,
            right: w + margin,
            bottom: -margin,
            top: 2 * h + margin
        };
        
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        this.scale = Math.min(
            this.canvas.width * 0.9 / viewportWidth,
            this.canvas.height * 0.9 / viewportHeight
        );
        
        this.offset = {
            x: this.canvas.width/2 - (this.viewportBounds.left + viewportWidth/2) * this.scale,
            y: this.canvas.height/2 + (this.viewportBounds.bottom + viewportHeight/2) * this.scale
        };
        
        this.draw();
    }
    
    // Transform a point from world coordinates to screen coordinates
    transform(point) {
        return {
            x: this.offset.x + point.x * this.scale,
            y: this.offset.y - point.y * this.scale
        };
    }
    
    // Transform a point from screen coordinates to world coordinates
    inverseTransform(point) {
        return {
            x: (point.x - this.offset.x) / this.scale,
            y: -(point.y - this.offset.y) / this.scale
        };
    }
    
    // Draw a circle at a point
    drawCircle(center, radius, color, fill = true) {
        const ctx = this.ctx;
        const screenCenter = this.transform(center);
        
        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, radius * this.scale, 0, 2 * Math.PI);
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    }
    
    // Draw text at a point
    drawText(text, point, color) {
        const ctx = this.ctx;
        const screenPoint = this.transform(point);
        
        ctx.fillStyle = color;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, screenPoint.x, screenPoint.y - 20);
    }
    
    // Draw box outline
    drawBox() {
        const vertices = this.geometry.getBoxVertices();
        const ctx = this.ctx;
        
        ctx.beginPath();
        const start = this.transform(vertices[0]);
        ctx.moveTo(start.x, start.y);
        
        for (let i = 1; i < vertices.length; i++) {
            const point = this.transform(vertices[i]);
            ctx.lineTo(point.x, point.y);
        }
        
        ctx.closePath();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw lid
    drawLid(vertices, color) {
        const ctx = this.ctx;
        
        ctx.beginPath();
        const start = this.transform(vertices[0]);
        ctx.moveTo(start.x, start.y);
        
        for (let i = 1; i < vertices.length; i++) {
            const point = this.transform(vertices[i]);
            ctx.lineTo(point.x, point.y);
        }
        
        ctx.closePath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw connection line and perpendicular line
    drawConnectionLine(line, color) {
        const ctx = this.ctx;
        
        // Draw dashed line between points
        ctx.beginPath();
        const start = this.transform(line.start);
        const end = this.transform(line.end);
        ctx.setLineDash([5, 5]);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Draw perpendicular line
        const perpStart = this.transform(line.perpStart);
        const perpEnd = this.transform(line.perpEnd);
        ctx.beginPath();
        ctx.moveTo(perpStart.x, perpStart.y);
        ctx.lineTo(perpEnd.x, perpEnd.y);
        ctx.stroke();
        
        // Reset line style
        ctx.setLineDash([]);
        
        // Draw points
        this.drawCircle(line.start, 5, color);
        this.drawCircle(line.end, 5, color);
        this.drawCircle(line.perpPoint, 5, color);
        
        // Draw highlight for selected point if it's the current color
        if (this.isDragging && this.selectedPoint) {
            const [selectedColor, pointType] = this.selectedPoint.split('-');
            if (selectedColor === color) {
                let point;
                if (pointType === 'open') {
                    point = line.end;
                } else if (pointType === 'closed') {
                    point = line.start;
                } else if (pointType === 'perp') {
                    point = line.perpPoint;
                }
                if (point) {
                    this.drawCircle(point, 7, color, false);
                }
            }
        }
    }
    
    // Main draw function
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw box
        this.drawBox();
        
        // Draw closed lid
        const closedLidVertices = this.geometry.getClosedLidVertices();
        this.drawLid(closedLidVertices, 'purple');
        
        // Draw open lid
        const openLidVertices = this.geometry.getOpenLidVertices();
        this.drawLid(openLidVertices, 'teal');
        
        // Draw and label center of rotation
        const center = this.geometry.getCenterOfRotation();
        this.drawCircle(center, 3, 'green');
        this.drawText('Center of Rotation', center, 'green');
        
        // Draw connection lines and points
        this.drawConnectionLine(this.geometry.getRedConnectionLine(), 'red');
        this.drawConnectionLine(this.geometry.getBlueConnectionLine(), 'blue');
    }
    
    // Mouse event handlers
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const point = this.inverseTransform({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        
        const threshold = 10 / this.scale;  // 10 pixels in world coordinates
        
        // Check red points
        if (this.geometry.isPointNearRedOpenPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'red-open';
        } else if (this.geometry.isPointNearRedClosedPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'red-closed';
        } else if (this.geometry.isPointNearRedPerpPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'red-perp';
        }
        // Check blue points
        else if (this.geometry.isPointNearBlueOpenPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-open';
        } else if (this.geometry.isPointNearBlueClosedPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-closed';
        } else if (this.geometry.isPointNearBluePerpPoint(point, threshold)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-perp';
        }
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const point = this.inverseTransform({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        
        const [color, pointType] = this.selectedPoint.split('-');
        const center = this.geometry.getCenterOfRotation();
        
        if (color === 'red') {
            if (pointType === 'open') {
                this.geometry.moveRedOpenPoint(point);
            } else if (pointType === 'closed') {
                // For closed point, move the open point to the opposite position
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                this.geometry.moveRedOpenPoint({
                    x: center.x - dx,
                    y: center.y - dy
                });
            } else if (pointType === 'perp') {
                this.geometry.moveRedPerpPoint(point);
            }
        } else { // blue
            if (pointType === 'open') {
                this.geometry.moveBlueOpenPoint(point);
            } else if (pointType === 'closed') {
                // For closed point, move the open point to the opposite position
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                this.geometry.moveBlueOpenPoint({
                    x: center.x - dx,
                    y: center.y - dy
                });
            } else if (pointType === 'perp') {
                this.geometry.moveBluePerpPoint(point);
            }
        }
        
        this.draw();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.selectedPoint = null;
    }
}
