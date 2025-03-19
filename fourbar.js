class FourBarLinkage {
    constructor(x, y) {
        // Center position
        this.center = new Vector2D(x, y);
        
        // Link lengths
        this.groundLength = 100;
        this.inputLength = 60;
        this.followerLength = 80;
        this.outputLength = 70;
        
        // Ground pivots
        this.leftPivot = this.center.add(new Vector2D(-this.groundLength/2, 0));
        this.rightPivot = this.center.add(new Vector2D(this.groundLength/2, 0));
        
        // Initial angle and configuration
        this.inputAngle = Math.PI/4;  // Start at 45 degrees
        this.config = 0;  // Start with upper configuration
        
        // State tracking
        this.inputEnd = null;
        this.outputEnd = null;
        this.prevOutputEnd = null;
        
        // Motion path tracking
        this.motionPath = [];
        this.maxPathPoints = 100;
        
        // Initialize positions
        this.updatePosition();
    }
    
    // Check if a configuration is valid (no bar extension needed)
    isValidConfiguration(inputEnd) {
        // Check if input bar length is maintained
        const inputLength = inputEnd.sub(this.leftPivot).length();
        if (Math.abs(inputLength - this.inputLength) > 0.1) {
            return false;
        }
        
        // Check if configuration is possible (triangle inequality)
        const rightToInput = inputEnd.sub(this.rightPivot).length();
        
        // Sum of follower and output must be >= distance between their pivots
        if (rightToInput > this.followerLength + this.outputLength) {
            return false;
        }
        
        // Difference of follower and output must be <= distance between their pivots
        if (rightToInput < Math.abs(this.followerLength - this.outputLength)) {
            return false;
        }
        
        return true;
    }
    
    circleIntersection(jointA, jointB, lengthA, lengthB) {
        const dx = jointB.x - jointA.x;
        const dy = jointB.y - jointA.y;
        const Lc = Math.sqrt(dx * dx + dy * dy);
        
        // Check if circles are too far apart or too close
        if (Lc > lengthA + lengthB || Lc < Math.abs(lengthA - lengthB)) {
            return [];
        }
        
        // Check if circles are coincident
        if (Lc < 1e-10 && Math.abs(lengthA - lengthB) < 1e-10) {
            return [];
        }
        
        // Calculate intersection points using their method
        const bb = ((lengthB * lengthB) - (lengthA * lengthA) + (Lc * Lc)) / (Lc * 2);
        const h = Math.sqrt(Math.max(0, lengthB * lengthB - bb * bb));
        
        const Xp = jointB.x + ((bb * (jointA.x - jointB.x)) / Lc);
        const Yp = jointB.y + ((bb * (jointA.y - jointB.y)) / Lc);
        
        // Calculate both intersection points
        const Xsol1 = Xp + ((h * (jointB.y - jointA.y)) / Lc);
        const Ysol1 = Yp - ((h * (jointB.x - jointA.x)) / Lc);
        const Xsol2 = Xp - ((h * (jointB.y - jointA.y)) / Lc);
        const Ysol2 = Yp + ((h * (jointB.x - jointA.x)) / Lc);
        
        return [
            new Vector2D(Xsol1, Ysol1),
            new Vector2D(Xsol2, Ysol2)
        ];
    }
    
    updatePosition() {
        // Store previous state
        this.prevOutputEnd = this.outputEnd ? this.outputEnd.clone() : null;
        
        // Calculate input end position using angle
        const newInputEnd = this.leftPivot.add(
            Vector2D.fromAngle(this.inputAngle, this.inputLength)
        );
        
        // Check if this is a valid configuration
        if (!this.isValidConfiguration(newInputEnd)) {
            return false;
        }
        
        this.inputEnd = newInputEnd;
        
        // Find intersection of two circles:
        // 1. Circle centered at inputEnd with radius = followerLength
        // 2. Circle centered at rightPivot with radius = outputLength
        const intersections = this.circleIntersection(
            this.inputEnd,
            this.rightPivot,
            this.followerLength,
            this.outputLength
        );
        
        if (intersections.length === 0) {
            // No valid configuration - revert if possible
            if (this.prevOutputEnd) {
                this.outputEnd = this.prevOutputEnd;
            }
            return false;
        }
        
        // Choose configuration based on high/low selection
        const [pos1, pos2] = intersections;
        
        if (!this.prevOutputEnd) {
            // First position - use config setting
            this.outputEnd = pos1.y > pos2.y ? 
                (this.config === 0 ? pos1 : pos2) : 
                (this.config === 0 ? pos2 : pos1);
        } else {
            // Choose closest point to previous position
            const d1 = pos1.sub(this.prevOutputEnd).lengthSq();
            const d2 = pos2.sub(this.prevOutputEnd).lengthSq();
            
            this.outputEnd = d1 < d2 ? pos1 : pos2;
            
            // Update configuration based on chosen point
            this.config = this.outputEnd.y > this.inputEnd.y ? 0 : 1;
        }
        
        // Update motion path
        this.updateMotionPath();
        
        return true;
    }
    
    updateMotionPath() {
        if (!this.outputEnd) return;
        
        this.motionPath.push(this.outputEnd.clone());
        if (this.motionPath.length > this.maxPathPoints) {
            this.motionPath.shift();
        }
    }
    
    isPointNearSegment(point, start, end, threshold) {
        const line = end.sub(start);
        const len = line.length();
        if (len === 0) return false;
        
        const dir = line.div(len);
        const toPoint = point.sub(start);
        const proj = toPoint.dot(dir);
        
        if (proj < 0 || proj > len) return false;
        
        const perpDist = Math.abs(toPoint.cross(dir));
        return perpDist <= threshold;
    }
    
    findDraggablePoint(point, threshold) {
        // Check pivots first
        const points = [
            { pos: this.leftPivot, type: 'pivot', id: 'left' },
            { pos: this.rightPivot, type: 'pivot', id: 'right' },
            { pos: this.inputEnd, type: 'joint', id: 'input' },
            { pos: this.outputEnd, type: 'joint', id: 'output' }
        ];
        
        for (const p of points) {
            if (p.pos && p.pos.sub(point).length() <= threshold) {
                return p;
            }
        }
        
        // Then check links
        const links = [
            { start: this.leftPivot, end: this.inputEnd, type: 'link', id: 'input' },
            { start: this.inputEnd, end: this.outputEnd, type: 'link', id: 'follower' },
            { start: this.rightPivot, end: this.outputEnd, type: 'link', id: 'output' }
        ];
        
        for (const link of links) {
            if (link.start && link.end && 
                this.isPointNearSegment(point, link.start, link.end, threshold)) {
                return link;
            }
        }
        
        return null;
    }
}

class FourBarRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Create linkage
        this.linkage = new FourBarLinkage(
            canvas.width/2,
            canvas.height/2
        );
        
        // Interaction state
        this.isDragging = false;
        this.dragTarget = null;
        this.hoverTarget = null;
        this.showPaths = true;
        this.showAlternative = false;
        
        // UI elements
        this.tooltip = document.getElementById('tooltip');
        this.showPathsCheckbox = document.getElementById('showPaths');
        this.showAlternativeCheckbox = document.getElementById('showAlternative');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial draw
        this.draw();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        
        this.showPathsCheckbox.addEventListener('change', (e) => {
            this.showPaths = e.target.checked;
            this.draw();
        });
        
        this.showAlternativeCheckbox.addEventListener('change', (e) => {
            this.showAlternative = e.target.checked;
            this.draw();
        });
    }
    
    draw() {
        const ctx = this.ctx;
        
        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw motion path
        if (this.showPaths && this.linkage.motionPath.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.moveTo(this.linkage.motionPath[0].x, this.linkage.motionPath[0].y);
            for (let i = 1; i < this.linkage.motionPath.length; i++) {
                ctx.lineTo(this.linkage.motionPath[i].x, this.linkage.motionPath[i].y);
            }
            ctx.stroke();
        }
        
        // Draw input and output circles when dragging
        if (this.isDragging && this.dragTarget && 
            this.dragTarget.type === 'joint' && 
            this.dragTarget.id === 'input') {
            // Input circle
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.arc(
                this.linkage.leftPivot.x,
                this.linkage.leftPivot.y,
                this.linkage.inputLength,
                0, 2 * Math.PI
            );
            ctx.stroke();
            
            if (this.linkage.inputEnd) {
                // Follower circle
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 0, 255, 0.2)';
                ctx.arc(
                    this.linkage.inputEnd.x,
                    this.linkage.inputEnd.y,
                    this.linkage.followerLength,
                    0, 2 * Math.PI
                );
                ctx.stroke();
                
                // Output circle
                ctx.beginPath();
                ctx.arc(
                    this.linkage.rightPivot.x,
                    this.linkage.rightPivot.y,
                    this.linkage.outputLength,
                    0, 2 * Math.PI
                );
                ctx.stroke();
            }
        }
        
        // Always draw all four bars if we have valid positions
        if (this.linkage.inputEnd && this.linkage.outputEnd) {
            // 1. Ground link (fixed)
            ctx.beginPath();
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 3;
            ctx.moveTo(this.linkage.leftPivot.x, this.linkage.leftPivot.y);
            ctx.lineTo(this.linkage.rightPivot.x, this.linkage.rightPivot.y);
            ctx.stroke();
            
            // 2. Input link (red)
            this.drawLink(this.linkage.leftPivot, this.linkage.inputEnd, '#FF0000', 'input');
            
            // 3. Follower link (blue)
            this.drawLink(this.linkage.inputEnd, this.linkage.outputEnd, '#0000FF', 'follower');
            
            // 4. Output link (green)
            this.drawLink(this.linkage.rightPivot, this.linkage.outputEnd, '#00FF00', 'output');
            
            // Draw joints
            this.drawJoint(this.linkage.leftPivot, '#FF0000', 'left');   // Input pivot
            this.drawJoint(this.linkage.rightPivot, '#00FF00', 'right'); // Output pivot
            this.drawJoint(this.linkage.inputEnd, '#666666', 'input');    // Moving joint 1
            this.drawJoint(this.linkage.outputEnd, '#666666', 'output');  // Moving joint 2
        }
        
        // Draw input angle
        ctx.fillStyle = '#333';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        const angleDegrees = (this.linkage.inputAngle * 180 / Math.PI).toFixed(1);
        ctx.fillText(`Input Angle: ${angleDegrees}°`, 10, 20);
        
        // Draw follower length
        if (this.linkage.inputEnd && this.linkage.outputEnd) {
            const currentLength = this.linkage.inputEnd.sub(this.linkage.outputEnd).length().toFixed(1);
            const targetLength = this.linkage.followerLength.toFixed(1);
            ctx.fillText(`Follower Length: ${currentLength} / ${targetLength}`, 10, 40);
        }
    }
    
    drawLink(start, end, color, id) {
        const ctx = this.ctx;
        const isHovered = this.hoverTarget && 
                         this.hoverTarget.type === 'link' && 
                         this.hoverTarget.id === id;
        
        ctx.beginPath();
        ctx.strokeStyle = isHovered ? this.lightenColor(color) : color;
        ctx.lineWidth = isHovered ? 5 : 3;
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }
    
    drawJoint(pos, color, id) {
        if (!pos) return;
        
        const ctx = this.ctx;
        const isHovered = this.hoverTarget && 
                         this.hoverTarget.type === 'joint' && 
                         this.hoverTarget.id === id;
        
        ctx.beginPath();
        ctx.fillStyle = isHovered ? this.lightenColor(color) : color;
        ctx.arc(pos.x, pos.y, isHovered ? 7 : 5, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    lightenColor(color) {
        const r = parseInt(color.substr(1,2), 16);
        const g = parseInt(color.substr(3,2), 16);
        const b = parseInt(color.substr(5,2), 16);
        return `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`;
    }
    
    showTooltip(text, x, y) {
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (x + 10) + 'px';
        this.tooltip.style.top = (y + 10) + 'px';
        this.tooltip.textContent = text;
    }
    
    hideTooltip() {
        this.tooltip.style.display = 'none';
    }
    
    getMousePoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vector2D(
            e.clientX - rect.left,
            e.clientY - rect.top
        );
    }
    
    handleMouseDown(e) {
        const point = this.getMousePoint(e);
        const target = this.linkage.findDraggablePoint(point, 10);
        
        if (target) {
            this.isDragging = true;
            this.dragTarget = target;
        }
    }
    
    handleMouseMove(e) {
        const point = this.getMousePoint(e);
        
        if (this.isDragging && this.dragTarget) {
            if (this.dragTarget.type === 'joint' && this.dragTarget.id === 'input') {
                // Calculate new angle
                const toPoint = point.sub(this.linkage.leftPivot);
                const newAngle = toPoint.angle();
                
                // Store current angle in case we need to revert
                const prevAngle = this.linkage.inputAngle;
                
                // Try to update with new angle
                this.linkage.inputAngle = newAngle;
                if (!this.linkage.updatePosition()) {
                    // If update fails, revert to previous angle
                    this.linkage.inputAngle = prevAngle;
                    this.linkage.updatePosition();
                }
            }
            this.draw();
        } else {
            // Update hover state
            const prevTarget = this.hoverTarget;
            this.hoverTarget = this.linkage.findDraggablePoint(point, 10);
            
            if (this.hoverTarget) {
                let tooltipText = '';
                if (this.hoverTarget.type === 'joint') {
                    tooltipText = `${this.hoverTarget.id} joint`;
                } else if (this.hoverTarget.type === 'link') {
                    tooltipText = `${this.hoverTarget.id} link`;
                }
                this.showTooltip(tooltipText, e.clientX, e.clientY);
            } else {
                this.hideTooltip();
            }
            
            // Only redraw if hover state changed
            if (JSON.stringify(prevTarget) !== JSON.stringify(this.hoverTarget)) {
                this.draw();
            }
        }
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.dragTarget = null;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    new FourBarRenderer(canvas);
});
