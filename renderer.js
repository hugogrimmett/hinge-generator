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
        
        // Set up event listeners
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        
        // Set up interaction state
        this.isDragging = false;
        this.selectedPoint = null;
        this.hoverPoint = null;
        
        // Animation controls
        const animateButton = document.getElementById('animateButton');
        if (animateButton) {
            animateButton.addEventListener('click', () => {
                if (this.geometry.isAnimating) {
                    this.geometry.isAnimating = false;
                    animateButton.textContent = 'Animate';
                } else {
                    this.geometry.startAnimation();
                    animateButton.textContent = 'Stop';
                    this.animate();
                }
            });
        }
        
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
    drawCircle(point, radius, color, fill = true) {
        const ctx = this.ctx;
        const screenPoint = this.transform(point);
        
        ctx.beginPath();
        ctx.arc(screenPoint.x, screenPoint.y, radius * this.scale, 0, 2 * Math.PI);
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
    
    // Draw connection line
    drawConnectionLine(line, color) {
        const ctx = this.ctx;
        
        // Draw dashed line between points
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        
        const start = this.transform(line.start);
        const end = this.transform(line.end);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        
        // Reset line dash
        ctx.setLineDash([]);
        
        // Draw perpendicular line
        ctx.beginPath();
        ctx.strokeStyle = `${color}33`;  // 20% opacity
        
        const perpStart = this.transform(line.perpStart);
        const perpEnd = this.transform(line.perpEnd);
        ctx.moveTo(perpStart.x, perpStart.y);
        ctx.lineTo(perpEnd.x, perpEnd.y);
        ctx.stroke();
        
        // Draw thick connecting lines
        ctx.beginPath();
        const boxPoint = this.transform(line.boxPoint);
        const openPoint = this.transform(line.end);
        const closedPoint = this.transform(line.start);
        
        ctx.moveTo(openPoint.x, openPoint.y);
        ctx.lineTo(boxPoint.x, boxPoint.y);
        ctx.lineTo(closedPoint.x, closedPoint.y);
        
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
        
        // Reset line style
        ctx.lineWidth = 1;
    }
    
    // Draw 4-bar linkage
    drawFourBarLinkage() {
        const ctx = this.ctx;
        
        // Get points for the linkage
        const points = this.geometry.getFourBarPoints();
        
        // Draw the four bars in black
        ctx.beginPath();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        
        // Start at red box point
        const redBox = this.transform(points.redBox);
        ctx.moveTo(redBox.x, redBox.y);
        
        // Draw to red closed point
        const redClosed = this.transform(points.redClosed);
        ctx.lineTo(redClosed.x, redClosed.y);
        
        // Draw to blue closed point
        const blueClosed = this.transform(points.blueClosed);
        ctx.lineTo(blueClosed.x, blueClosed.y);
        
        // Draw to blue box point
        const blueBox = this.transform(points.blueBox);
        ctx.lineTo(blueBox.x, blueBox.y);
        
        // Complete the linkage
        ctx.lineTo(redBox.x, redBox.y);
        
        ctx.stroke();
    }
    
    // Draw red connection line
    drawRedConnectionLine() {
        const line = this.geometry.getRedConnectionLine();
        if (line) this.drawConnectionLine(line, 'red');
    }
    
    // Draw blue connection line
    drawBlueConnectionLine() {
        const line = this.geometry.getBlueConnectionLine();
        if (line) this.drawConnectionLine(line, 'blue');
    }
    
    // Draw points
    drawPoints() {
        const points = this.geometry.getPoints();
        for (const point of points) {
            this.drawCircle(point, 5, 'black');
        }
    }
    
    // Main draw function
    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw box outline
        this.drawBox();
        
        // Draw lid in both positions
        this.drawLid(this.geometry.getClosedLidVertices(), 'rgba(0, 0, 0, 0.5)');
        this.drawLid(this.geometry.getOpenLidVertices(), 'rgba(0, 0, 0, 0.5)');
        
        // Draw four-bar linkage if initialized
        const fb = this.geometry.fourBarConfig;
        if (fb) {
            // Draw ground link (gray)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
            ctx.lineWidth = 2;
            const groundStart = this.transform(fb.leftPivot);
            const groundEnd = this.transform(fb.rightPivot);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(groundEnd.x, groundEnd.y);
            ctx.stroke();
            
            // Draw input link (red) with hover effect
            ctx.beginPath();
            ctx.strokeStyle = this.hoverPoint === 'fourbar_input' ? 
                'rgba(255, 0, 0, 0.8)' : 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = this.hoverPoint === 'fourbar_input' ? 4 : 2;
            const inputEnd = this.transform(fb.inputEnd);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(inputEnd.x, inputEnd.y);
            ctx.stroke();
            
            // Draw follower link (blue)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
            ctx.lineWidth = 2;
            const outputEnd = this.transform(fb.outputEnd);
            ctx.moveTo(inputEnd.x, inputEnd.y);
            ctx.lineTo(outputEnd.x, outputEnd.y);
            ctx.stroke();
            
            // Draw output link (green)
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.moveTo(groundEnd.x, groundEnd.y);
            ctx.lineTo(outputEnd.x, outputEnd.y);
            ctx.stroke();
            
            // Draw input angle
            ctx.fillStyle = '#333';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            const angleDegrees = (fb.inputAngle * 180 / Math.PI).toFixed(1);
            ctx.fillText(`Input Angle: ${angleDegrees}°`, 10, 20);
        }
        
        // Draw connection lines
        this.drawRedConnectionLine();
        this.drawBlueConnectionLine();
        
        // Draw 4-bar linkage
        this.drawFourBarLinkage();
        
        // Draw points
        const redLine = this.geometry.getRedConnectionLine();
        const blueLine = this.geometry.getBlueConnectionLine();
        
        if (redLine) {
            this.drawCircle(redLine.start, 5, 'red');
            this.drawCircle(redLine.end, 5, 'red');
            this.drawCircle(redLine.boxPoint, 5, 'red');
        }
        
        if (blueLine) {
            this.drawCircle(blueLine.start, 5, 'blue');
            this.drawCircle(blueLine.end, 5, 'blue');
            this.drawCircle(blueLine.boxPoint, 5, 'blue');
        }
    }
    
    // Mouse event handlers
    handleMouseDown(e) {
        const point = this.getMousePoint(e);
        
        // Check four-bar input first
        const fb = this.geometry.fourBarConfig;
        if (fb && fb.inputEnd) {
            const inputLinkDist = this.distToSegment(
                point,
                fb.leftPivot,
                fb.inputEnd
            );
            
            if (inputLinkDist < 0.1) {  // Threshold in world coordinates
                this.isDragging = true;
                this.selectedPoint = 'fourbar_input';
                return;
            }
        }
        
        // Check red points
        if (this.geometry.isPointNearRedOpenPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'red-open';
        } else if (this.geometry.isPointNearRedClosedPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'red-closed';
        } else if (this.geometry.isPointNearRedBoxPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'red-box';
        }
        // Check blue points
        else if (this.geometry.isPointNearBlueOpenPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-open';
        } else if (this.geometry.isPointNearBlueClosedPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-closed';
        } else if (this.geometry.isPointNearBlueBoxPoint(point, 10 / this.scale)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-box';
        }
    }
    
    handleMouseMove(e) {
        const point = this.getMousePoint(e);
        
        if (!this.isDragging) {
            // Check if mouse is near four-bar input link
            const fb = this.geometry.fourBarConfig;
            if (fb && fb.inputEnd) {
                const inputLinkDist = this.distToSegment(
                    point,
                    fb.leftPivot,
                    fb.inputEnd
                );
                
                if (inputLinkDist < 0.1) {  // Threshold in world coordinates
                    this.canvas.style.cursor = 'pointer';
                    this.hoverPoint = 'fourbar_input';
                    this.draw();
                    return;
                }
            }
            
            // Reset cursor if not hovering
            this.canvas.style.cursor = 'default';
            if (this.hoverPoint) {
                this.hoverPoint = null;
                this.draw();
            }
            return;
        }
        
        if (this.selectedPoint === 'fourbar_input') {
            // Calculate new angle for four-bar input
            const fb = this.geometry.fourBarConfig;
            if (fb) {
                const worldPoint = point;  // Already in world coordinates
                const toPoint = {
                    x: worldPoint.x - fb.leftPivot.x,
                    y: worldPoint.y - fb.leftPivot.y
                };
                const newAngle = Math.atan2(toPoint.y, toPoint.x);
                
                // Try to update with new angle
                const prevAngle = fb.inputAngle;
                if (!this.geometry.updateFourBarPosition(newAngle)) {
                    // If update fails, revert to previous angle
                    this.geometry.updateFourBarPosition(prevAngle);
                }
            }
        } else {
            // Handle existing point dragging
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
                } else if (pointType === 'box') {
                    this.geometry.moveRedBoxPoint(point);
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
                } else if (pointType === 'box') {
                    this.geometry.moveBlueBoxPoint(point);
                }
            }
            
            // Re-initialize four-bar after pivot points move
            this.geometry.initializeFourBar();
        }
        
        this.draw();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.selectedPoint = null;
    }
    
    // Animation loop
    animate() {
        if (this.geometry.isAnimating) {
            this.geometry.updateAnimation();
            this.draw();
            requestAnimationFrame(this.animate.bind(this));
        }
    }
    
    // Clean up
    destroy() {
        // Stop animation
        this.geometry.stopAnimation();
        
        // Remove event listeners
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
    }
    
    getMousePoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return this.inverseTransform({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
    }
    
    distToSegment(p, v, w) {
        const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
        if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + 
                        Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
    }
}
