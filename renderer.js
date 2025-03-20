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
        
        // Add template generation button listener
        const generateButton = document.getElementById('generateTemplateButton');
        if (generateButton) {
            generateButton.addEventListener('click', () => this.generateTemplate());
        }
        
        // Set up interaction state
        this.isDragging = false;
        this.selectedPoint = null;
        this.isLocked = false;
        this.exitAngle = null;
        this.lastAngle = null;
        this.lastValidConfig = null;
        
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
        
        // Animation variables
        this.animationId = null;
        this.animationTime = 0;
        this.animationDuration = 3000;  // 3 seconds for a full cycle
        this.lastTimestamp = null;
    }
    
    updateParameters(h, w, d, alpha, g) {
        // Store current pivot positions
        const boxPivotPositions = this.geometry.getBoxPivotPositions();
        const lidPivotPositions = this.geometry.getLidPivotPositions();
        
        // Create new geometry with updated parameters
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Restore pivot positions if they were previously set
        if (boxPivotPositions) {
            this.geometry.setBoxPivotPositions(boxPivotPositions);
        }
        if (lidPivotPositions) {
            this.geometry.setLidPivotPositions(lidPivotPositions);
        }
        
        // Update constraint lines based on restored positions
        this.geometry.updateConstraintLines();
        
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
        
        // First update constraint lines and compute valid angles
        this.geometry.updateConstraintLines();
        this.geometry.updateRedClosedPoint();
        this.geometry.updateBlueClosedPoint();
        
        // Then recompute four-bar linkage configuration
        this.geometry.initializeFourBar();
        
        // Update animation state based on configuration validity
        if (!this.geometry.fourBarConfig) {
            // Stop animation if configuration is invalid
            this.geometry.isAnimating = false;
            const animateButton = document.getElementById('animateButton');
            if (animateButton) {
                animateButton.textContent = 'Animate';
            }
        } else {
            // Start new animation from closed position if configuration is valid
            this.geometry.startAnimation();
            const animateButton = document.getElementById('animateButton');
            if (animateButton) {
                animateButton.textContent = 'Stop';
            }
            this.animate();
        }
        
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
        ctx.arc(screenPoint.x, screenPoint.y, radius, 0, 2 * Math.PI);
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
        ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';
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
        
        // Check if current configuration is valid
        if (this.geometry.fourBarConfig) {
            const isValid = this.geometry.isValidRangeReachable();
            
            if (!isValid) {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Show error message
                ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';
                ctx.fillStyle = 'red';
                ctx.textAlign = 'center';
                ctx.fillText(
                    "This hinge will not allow the lid to open and close. Try moving the red and blue pivot points.",
                    this.canvas.width / 2,
                    30
                );
            }
            
            // Start animation if valid and not dragging
            if (isValid && !this.isDragging && !this.animationId) {
                this.startAnimation();
            }
        }
        
        // Draw box outline
        this.drawBox();
        
        // Draw lid in both positions
        this.drawLid(this.geometry.getClosedLidVertices(), 'rgba(0, 0, 0, 0.5)');
        this.drawLid(this.geometry.getOpenLidVertices(), 'rgba(0, 0, 0, 0.5)');
        
        // Draw labels
        ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'left';
        
        // Box label
        const boxVertices = this.geometry.getBoxVertices();
        const boxCenter = this.transform({
            x: (boxVertices[0].x + boxVertices[2].x) / 2,
            y: (boxVertices[0].y + boxVertices[2].y) / 2
        });
        ctx.fillText('box', boxCenter.x - 10, boxCenter.y);
        
        // Closed lid label
        const closedLidVertices = this.geometry.getClosedLidVertices();
        const closedLidCenter = this.transform({
            x: (closedLidVertices[0].x + closedLidVertices[1].x) / 6,
            y: closedLidVertices[0].y - 20  // 20 pixels above the lid
        });
        ctx.fillText('lid in closed position', closedLidCenter.x, closedLidCenter.y);
        
        // Open lid label
        const openLidVertices = this.geometry.getOpenLidVertices();
        const openLidCenter = this.transform({
            x: (openLidVertices[0].x + openLidVertices[1].x) / 2,
            y: (openLidVertices[2].y + openLidVertices[1].y) / 2
        });
        ctx.fillText('lid in open position', openLidCenter.x, openLidCenter.y);
        
        // Draw four-bar linkage if initialized
        const fb = this.geometry.fourBarConfig;
        if (fb) {
            // Draw ground link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const groundStart = this.transform(fb.leftPivot);
            const groundEnd = this.transform(fb.rightPivot);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(groundEnd.x, groundEnd.y);
            ctx.stroke();
            
            // Draw input link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const inputEnd = this.transform(fb.inputEnd);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(inputEnd.x, inputEnd.y);
            ctx.stroke();
            
            // Draw follower link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const outputEnd = this.transform(fb.outputEnd);
            ctx.moveTo(inputEnd.x, inputEnd.y);
            ctx.lineTo(outputEnd.x, outputEnd.y);
            ctx.stroke();
            
            // Draw output link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.moveTo(groundEnd.x, groundEnd.y);
            ctx.lineTo(outputEnd.x, outputEnd.y);
            ctx.stroke();
        }
        
        // Draw connection lines
        this.drawRedConnectionLine();
        this.drawBlueConnectionLine();
        
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
        
        // Stop animation when starting to drag
        this.stopAnimation();
        
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
        
        if (!this.isDragging) return;
        
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
        
        this.draw();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.selectedPoint = null;
        
        // Try to restart animation
        if (this.geometry.fourBarConfig && this.geometry.isValidRangeReachable()) {
            this.startAnimation();
        }
    }
    
    // Animation loop
    animate() {
        if (this.geometry.isAnimating) {
            this.geometry.updateAnimation();
            this.draw();
            requestAnimationFrame(this.animate.bind(this));
        }
    }
    
    startAnimation() {
        if (this.animationId) return;  // Already animating
        
        const animate = (timestamp) => {
            // Stop animation if mouse is down or range is not reachable
            if (this.isDragging || !this.geometry.isValidRangeReachable()) {
                this.stopAnimation();
                return;
            }
            
            // Update animation time
            if (!this.lastTimestamp) {
                this.lastTimestamp = timestamp;
            }
            const deltaTime = timestamp - this.lastTimestamp;
            this.lastTimestamp = timestamp;
            
            this.animationTime = (this.animationTime + deltaTime) % this.animationDuration;
            
            // Calculate progress (0 to 1, then 1 to 0)
            let progress = this.animationTime / (this.animationDuration / 2);
            if (progress > 1) {
                progress = 2 - progress;  // Return back to closed position
            }
            
            // Get angle range and interpolate
            const range = this.geometry.getValidAngleRange();
            const angle = range.start - (range.start - range.end) * progress;
            
            // Update linkage position
            this.geometry.updateFourBarPosition(angle);
            
            // Draw
            this.draw();
            
            // Continue animation
            this.animationId = requestAnimationFrame(animate);
        };
        
        this.lastTimestamp = null;
        this.animationTime = 0;
        this.animationId = requestAnimationFrame(animate);
    }
    
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            this.lastTimestamp = null;
            
            // Hide linkage by clearing four-bar config
            const prevConfig = this.geometry.fourBarConfig;
            this.geometry.fourBarConfig = null;
            this.draw();
            this.geometry.fourBarConfig = prevConfig;
        }
    }
    
    // Clean up
    destroy() {
        // Stop animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Remove event listeners
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
    }
    
    getMousePoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Account for CSS scaling
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return this.inverseTransform({
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        });
    }
    
    generateTemplate() {
        // Get template bounds
        const bounds = this.geometry.getTemplateBounds();
        
        // Debug output
        console.log('Box Points:', {
            red: this.geometry.redBoxPoint,
            blue: this.geometry.blueBoxPoint
        });
        console.log('Closed Points:', {
            red: this.geometry.redClosedPoint,
            blue: this.geometry.blueClosedPoint
        });
        console.log('Bounds:', bounds);
        
        // Create PDF with 1:1 scale (1 unit = 1 cm)
        const { jsPDF } = window.jspdf;
        const margin = 2;  // 2cm margin
        const pdfWidth = bounds.width + 2 * margin;
        const pdfHeight = bounds.height + 2 * margin;
        const pdf = new jsPDF('p', 'cm', [pdfWidth, pdfHeight]);
        
        // Transform from model coordinates to PDF coordinates
        // No scaling needed since we want 1:1, just translate to add margins and flip Y
        const transform = (point) => ({
            x: point.x - bounds.left + margin,
            y: pdfHeight - (point.y - bounds.bottom) - margin  // Fix Y coordinate transformation
        });
        
        // Helper to check if point is within bounds
        const isInBounds = (point) => {
            const margin = 0.1;  // 1mm margin
            return point.x >= bounds.left - margin && 
                   point.x <= bounds.right + margin &&
                   point.y >= bounds.bottom - margin && 
                   point.y <= bounds.top + margin;
        };
        
        // Draw box outline
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.01);
        
        const boxVertices = this.geometry.getBoxVertices();
        for (let i = 0; i < boxVertices.length; i++) {
            const p1 = boxVertices[i];
            const p2 = boxVertices[(i + 1) % boxVertices.length];
            
            // Only draw if at least one endpoint is in bounds
            if (isInBounds(p1) || isInBounds(p2)) {
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            }
        }
        
        // Draw closed lid outline
        const closedLidVertices = this.geometry.getClosedLidVertices();
        pdf.setDrawColor(100);
        
        for (let i = 0; i < closedLidVertices.length; i++) {
            const p1 = closedLidVertices[i];
            const p2 = closedLidVertices[(i + 1) % closedLidVertices.length];
            
            // Only draw if at least one endpoint is in bounds
            if (isInBounds(p1) || isInBounds(p2)) {
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            }
        }
        
        // Draw pivot points
        const points = [
            { point: this.geometry.redBoxPoint, color: 'red' },
            { point: this.geometry.blueBoxPoint, color: 'blue' },
            { point: this.geometry.redClosedPoint, color: 'red' },
            { point: this.geometry.blueClosedPoint, color: 'blue' }
        ];
        
        const radius = 0.1;  // 1mm radius for points
        for (const {point, color} of points) {
            const p = transform(point);
            pdf.setFillColor(color === 'red' ? '#ff0000' : '#0000ff');
            pdf.circle(p.x, p.y, radius, 'F');
        }

        // Draw connection lines and their lengths
        const drawConnection = (p1, p2, color) => {
            const tp1 = transform(p1);
            const tp2 = transform(p2);
            
            // Draw line
            pdf.setDrawColor(color === 'red' ? '#ff0000' : '#0000ff');
            pdf.setLineWidth(0.01);  // thin line
            pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            
            // Calculate length in cm (using original points for true length)
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate midpoint for label
            const midX = (tp1.x + tp2.x) / 2;
            const midY = (tp1.y + tp2.y) / 2;
            
            // Add length label
            pdf.setFontSize(8);
            pdf.setTextColor(color === 'red' ? '#ff0000' : '#0000ff');
            const text = `${length.toFixed(1)}cm`;
            const textWidth = pdf.getTextWidth(text);
            pdf.text(text, midX - textWidth/2, midY - 0.15);  // Center text above line
            pdf.setTextColor(0);  // Reset to black
        };
        
        // Draw red and blue connections
        drawConnection(this.geometry.redBoxPoint, this.geometry.redClosedPoint, 'red');
        drawConnection(this.geometry.blueBoxPoint, this.geometry.blueClosedPoint, 'blue');
        
        // Add dimensions at top
        pdf.setFontSize(10);
        pdf.text(`Box dimensions: ${this.geometry.width}cm wide \u00D7 ${this.geometry.height}cm tall`, margin, margin);
        pdf.text(`Lid angle: ${Math.round(this.geometry.closedAngle * 180 / Math.PI)}\u00B0, depth: ${this.geometry.depth}cm`, margin, margin + 0.5);
        pdf.text(`Gap when open: ${this.geometry.gap}cm`, margin, margin + 1);
        
        // Add scale line (10cm)
        const scaleStartX = margin;
        const scaleLineY = pdfHeight - margin;
        const scaleEndX = scaleStartX + 10; // 10cm length
        
        // Draw the scale line
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.02);
        pdf.line(scaleStartX, scaleLineY, scaleEndX, scaleLineY);
        
        // Add small vertical marks at start and end
        const tickLength = 0.2; // 2mm tick length
        pdf.line(scaleStartX, scaleLineY - tickLength/2, scaleStartX, scaleLineY + tickLength/2);
        pdf.line(scaleEndX, scaleLineY - tickLength/2, scaleEndX, scaleLineY + tickLength/2);
        
        // Add labels
        pdf.setFontSize(8);
        pdf.text('0', scaleStartX - 0.2, scaleLineY + 0.5);
        pdf.text('10cm', scaleEndX - 0.5, scaleLineY + 0.5);
        
        // Save the PDF
        pdf.save('hinge-template.pdf');
    }
}
