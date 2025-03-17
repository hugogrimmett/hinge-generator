class MechanismAnimation {
    constructor(canvas, h, w, d, alpha, g) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.solver = new FourBarSolver(h, w, d, alpha, g);
        
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

        // Initial draw
        this.draw();
    }
    
    updateParameters(h, w, d, alpha, g) {
        this.solver = new FourBarSolver(h, w, d, alpha, g);
        
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
    
    // Draw a circle at a point
    drawCircle(center, radius, color) {
        const ctx = this.ctx;
        const screenCenter = this.transform(center);
        
        ctx.beginPath();
        ctx.arc(screenCenter.x, screenCenter.y, radius * this.scale, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
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
        const vertices = this.solver.getBoxVertices();
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
    
    // Main draw function
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw box
        this.drawBox();
        
        // Draw closed lid
        const closedLidVertices = this.solver.getClosedLidVertices();
        this.drawLid(closedLidVertices, 'blue');
        
        // Draw open lid
        const openLidVertices = this.solver.getOpenLidVertices();
        this.drawLid(openLidVertices, 'red');
        
        // Draw and label center of rotation
        const center = this.solver.getCenterOfRotation();
        this.drawCircle(center, 3, 'green');
        this.drawText('Center of Rotation', center, 'green');
    }
}
