class BoxRenderer {
    constructor(canvas, h, w, d, alpha, g) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Handle high-DPI displays
        const dpr = window.devicePixelRatio || 1;
        
        // Canvas is already sized in HTML, just handle DPI scaling
        this.canvas.width = this.canvas.width * dpr;
        this.canvas.height = this.canvas.height * dpr;
        
        // Store display size for calculations
        this.displayWidth = this.canvas.width / dpr;
        this.displayHeight = this.canvas.height / dpr;
        
        // Scale context to device
        this.ctx.scale(dpr, dpr);
        
        // Create geometry
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Calculate viewport bounds and scale
        const margin = Math.max(h, w) * 0.1;  // 10% margin
        this.viewportBounds = {
            left: -margin,
            right: w + margin,
            bottom: -margin,
            top: 2.4 * h + margin  // Need space for open lid
        };
        
        // Calculate scale to fit viewport in canvas
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        this.scale = Math.min(
            this.displayWidth * 0.9 / viewportWidth,
            this.displayHeight * 0.9 / viewportHeight
        );
        
        this.offset = {
            x: this.displayWidth / 2,
            y: this.displayHeight / 2
        };
        
        // Set up interaction state
        this.isDragging = false;
        this.selectedPoint = null;
        this.isLocked = false;
        this.exitAngle = null;
        this.lastAngle = null;
        this.lastValidConfig = null;
        this.isTouchDevice = 'ontouchstart' in window;  // Detect touch device
        
        // Set up event listeners
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));
        
        // Add touch event listeners
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
        
        // Add template generation button listener
        const generateButton = document.getElementById('generateTemplateButton');
        if (generateButton) {
            generateButton.addEventListener('click', () => this.generateTemplate());
        }
        
        // Animation state
        this.geometry.isAnimating = true;
        this.animationTime = 0;
        this.animationDuration = 2000;  // 2 seconds for a full cycle
        this.lastTimestamp = null;
        
        // Initialize geometry and draw
        this.geometry.initializeFourBar();
        
        // Start animation if configuration is valid
        if (this.geometry.isValidRangeReachable()) {
            this.startAnimation();
        } else {
            this.draw();
        }
    }
    
    updateParameters(h, w, d, alpha, g) {
        // Store current pivot positions
        const boxPivotPositions = this.geometry.getBoxPivotPositions();
        const lidPivotPositions = this.geometry.getLidPivotPositions();
        
        // Create new geometry with updated parameters
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Initialize basic geometry but skip constraint lines
        this.geometry.initializePivotPoints();
        
        // Restore box pivot positions first since lid positions depend on them
        if (boxPivotPositions) {
            this.geometry.setBoxPivotPositions(boxPivotPositions);
        }
        
        // Then restore lid pivot positions
        if (lidPivotPositions) {
            this.geometry.setLidPivotPositions(lidPivotPositions);
        }
        
        // Now update constraint lines based on restored positions
        this.geometry.updateConstraintLines();
        
        // Update closed points based on restored positions
        this.geometry.updateRedClosedPoint();
        this.geometry.updateBlueClosedPoint();
        
        // Recalculate viewport bounds and scale
        const margin = Math.max(h, w) * 0.1;
        this.viewportBounds = {
            left: -margin,
            right: w + margin,
            bottom: -margin,
            top: 2.4 * h + margin  // Need space for open lid
        };
        
        // Calculate scale to fit viewport in canvas
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        this.scale = Math.min(
            this.displayWidth * 0.9 / viewportWidth,
            this.displayHeight * 0.9 / viewportHeight
        );
        
        this.offset = {
            x: this.displayWidth / 2,
            y: this.displayHeight / 2
        };
        
        // Then recompute four-bar linkage configuration
        this.geometry.initializeFourBar();
        
        // Stop any existing animation
        this.stopAnimation();
        
        // Check if configuration is valid and start animation if it is
        if (this.geometry.isValidRangeReachable()) {
            this.geometry.fourBarConfig = this.geometry.getFourBarConfig();  // Get fresh config
            this.startAnimation();
        } else {
            this.draw();  // Only draw if we're not starting animation
        }
    }
    
    // Transform a point from world coordinates to screen coordinates
    transform(point) {
        if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
            console.error('Invalid point:', point);
            throw new Error('Invalid point coordinates');
        }
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        return {
            x: this.offset.x + (point.x - this.viewportBounds.left - viewportWidth/2) * this.scale,
            y: this.offset.y - (point.y - this.viewportBounds.bottom - viewportHeight/2) * this.scale
        };
    }
    
    // Transform a point from screen coordinates to world coordinates
    inverseTransform(point) {
        const viewportWidth = this.viewportBounds.right - this.viewportBounds.left;
        const viewportHeight = this.viewportBounds.top - this.viewportBounds.bottom;
        
        return {
            x: (point.x - this.offset.x) / this.scale + this.viewportBounds.left + viewportWidth/2,
            y: -(point.y - this.offset.y) / this.scale + this.viewportBounds.bottom + viewportHeight/2
        };
    }
    
    // Draw a circle at a point
    drawCircle(point, radius, color, fill = true) {
        const ctx = this.ctx;
        const tp = this.transform(point);
        const actualRadius = radius * (this.isTouchDevice ? 2 : 1.3);  // Larger radius for touch devices

        // Draw highlight for interactive points
        if ((color === 'red' || color === 'blue') && this.isTouchDevice) {
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, actualRadius + 8, 0, Math.PI * 2);
            ctx.fillStyle = `${color === 'red' ? '#ff6666' : '#4d94ff'}22`;  // Very light highlight
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(tp.x, tp.y, actualRadius, 0, Math.PI * 2);
        if (fill) {
            ctx.fillStyle = color === 'red' ? '#ff6666' : color === 'blue' ? '#4d94ff' : color;  // More vibrant
            ctx.fill();
        } else {
            ctx.strokeStyle = color === 'red' ? '#ff6666' : color === 'blue' ? '#4d94ff' : color;  // More vibrant
            ctx.stroke();
        }
    }
    
    // Draw text at a point
    drawText(text, point, color) {
        const ctx = this.ctx;
        const tp = this.transform(point);
        
        // Make font size responsive to canvas width
        const baseFontSize = Math.min(14, this.canvas.width / 40);
        ctx.font = `${baseFontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Adjust vertical spacing based on canvas size
        const verticalOffset = Math.min(20, this.canvas.width / 30);
        ctx.fillText(text, tp.x, tp.y - verticalOffset);
    }
    
    // Draw box outline
    drawBox() {
        const ctx = this.ctx;
        const vertices = this.geometry.getBoxVertices();
        
        ctx.beginPath();
        const first = this.transform(vertices[0]);
        ctx.moveTo(first.x, first.y);
        
        for (let i = 1; i < vertices.length; i++) {
            const point = this.transform(vertices[i]);
            ctx.lineTo(point.x, point.y);
        }
        
        ctx.closePath();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';  // Increased opacity from 0.1 to 0.3
        ctx.fill();
        ctx.strokeStyle = '#000';
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
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';  // Same as box
        ctx.fill();
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
        ctx.strokeStyle = color === 'red' ? '#ff6666' : color === 'blue' ? '#4d94ff' : color;  // More vibrant
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
        ctx.setLineDash([2, 2]);  // Dotted line
        ctx.strokeStyle = color === 'red' ? '#ff8080' : color === 'blue' ? '#80b3ff' : `${color}33`;  // Lighter but still vibrant
        
        const perpStart = this.transform(line.perpStart);
        const perpEnd = this.transform(line.perpEnd);
        ctx.moveTo(perpStart.x, perpStart.y);
        ctx.lineTo(perpEnd.x, perpEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);  // Reset dash
        
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
        ctx.strokeStyle = color === 'red' ? '#ff6666' : color === 'blue' ? '#4d94ff' : color;  // More vibrant
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
        this.drawLid(this.geometry.getClosedLidVertices(), 'black');
        this.drawLid(this.geometry.getOpenLidVertices(), 'black');
        
        // Draw moving lid if available and animating
        const movingLidVertices = this.geometry.getMovingLidVertices();
        if (movingLidVertices && this.geometry.isAnimating) {
            this.drawLid(movingLidVertices, '#66c2a588');  // Semi-transparent teal
        }
        
        // Draw labels
        ctx.font = '14px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Closed lid label
        const closedLidVertices = this.geometry.getClosedLidVertices();
        const closedLidCenter = this.transform({
            x: (closedLidVertices[0].x + closedLidVertices[1].x) / 6,
            y: (closedLidVertices[0].y + closedLidVertices[2].y) * 2 / 3
        });
        ctx.fillText('closed lid', closedLidCenter.x, closedLidCenter.y);
        
        // Open lid label
        const openLidVertices = this.geometry.getOpenLidVertices();
        const openLidCenter = this.transform({
            x: (openLidVertices[0].x + openLidVertices[1].x) / 2,
            y: (openLidVertices[2].y + openLidVertices[1].y) / 2
        });
        ctx.fillText('open lid', openLidCenter.x, openLidCenter.y);
        
        // Check if current configuration is valid
        const isValid = this.geometry.isValidRangeReachable();
        
        if (!isValid) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
            ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
            
            // Show error message with responsive font size and line wrapping
            const fontSize = Math.min(18, this.displayWidth / 25);
            ctx.font = `400 ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
            ctx.fillStyle = 'red';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Calculate available width for text (80% of canvas width)
            const maxWidth = this.displayWidth * 0.8;
            
            // Warning messages
            const message = [
                "This hinge will not allow the lid to open and close.",
                "Try moving the red and blue pivot points."
            ];
            
            // Position text vertically based on canvas size
            const lineHeight = fontSize * 1.5;  // Slightly increased for better readability
            const startY = Math.max(lineHeight, this.displayHeight * 0.1);
            
            // Draw each line with consistent spacing
            message.forEach((line, i) => {
                // Reset font for each line to ensure consistency
                ctx.font = `400 ${fontSize}px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
                ctx.fillText(line, this.displayWidth / 2, startY + i * lineHeight, maxWidth);
            });
            
            // Stop any existing animation
            this.stopAnimation();
        } else if (!this.isDragging && !this.animationId) {
            // Start animation if valid and not already animating
            this.startAnimation();
        }
        
        // Draw four-bar linkage if initialized and animating
        const fb = this.geometry.fourBarConfig;
        if (fb && this.geometry.isAnimating) {
            // Draw ground line
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            const groundStart = this.transform(fb.inputGround);
            const groundEnd = this.transform(fb.outputGround);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(groundEnd.x, groundEnd.y);
            ctx.stroke();
            
            // Draw input link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const inputFollower = this.transform(fb.inputFollower);
            ctx.moveTo(groundStart.x, groundStart.y);
            ctx.lineTo(inputFollower.x, inputFollower.y);
            ctx.stroke();
            
            // Draw follower link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            const outputFollower = this.transform(fb.outputFollower);
            ctx.moveTo(inputFollower.x, inputFollower.y);
            ctx.lineTo(outputFollower.x, outputFollower.y);
            ctx.stroke();
            
            // Draw output link
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.moveTo(groundEnd.x, groundEnd.y);
            ctx.lineTo(outputFollower.x, outputFollower.y);
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
        
        // Draw debug info in top left
        // ctx.save();
        // ctx.font = '12px monospace';
        // ctx.fillStyle = 'black';
        // let y = 20;
        // const points = this.geometry.getFourBarPoints();
        // if (points && points.redClosed && points.blueClosed && points.follower) {
        //     const C = [points.blueClosed.x - points.redClosed.x, points.blueClosed.y - points.redClosed.y];
        //     const F = [points.follower.end.x - points.follower.start.x, points.follower.end.y - points.follower.start.y];
        //     const theta = Math.acos((C[0]*F[0] + C[1]*F[1]) / (Math.sqrt(C[0]*C[0] + C[1]*C[1]) * Math.sqrt(F[0]*F[0] + F[1]*F[1])));
        //     ctx.fillText(`C: [${C[0].toFixed(1)}, ${C[1].toFixed(1)}]`, 10, y); y += 15;
        //     ctx.fillText(`F: [${F[0].toFixed(1)}, ${F[1].toFixed(1)}]`, 10, y); y += 15;
        //     ctx.fillText(`θ: ${(theta * 180 / Math.PI).toFixed(1)}°`, 10, y); y += 15;
        // }
        // ctx.restore();
    }
    
    // Mouse event handlers
    handleMouseDown(e) {
        const point = this.getMousePoint(e);
        const hitArea = this.isTouchDevice ? 20 / this.scale : 10 / this.scale;  // Larger hit area for touch
        
        // Stop animation when starting to drag
        this.stopAnimation();
        
        // Check red points
        if (this.geometry.isPointNearRedOpenPoint(point, hitArea)) {
            this.isDragging = true;
            this.selectedPoint = 'red-open';
        } else if (this.geometry.isPointNearRedClosedPoint(point, hitArea)) {
            this.isDragging = true;
            this.selectedPoint = 'red-closed';
        } else if (this.geometry.isPointNearRedBoxPoint(point, hitArea)) {
            this.isDragging = true;
            this.selectedPoint = 'red-box';
        }
        // Check blue points
        else if (this.geometry.isPointNearBlueOpenPoint(point, hitArea)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-open';
        } else if (this.geometry.isPointNearBlueClosedPoint(point, hitArea)) {
            this.isDragging = true;
            this.selectedPoint = 'blue-closed';
        } else if (this.geometry.isPointNearBlueBoxPoint(point, hitArea)) {
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
        if (this.isDragging) {
            this.isDragging = false;
            this.selectedPoint = null;
            
            // Check if configuration is valid and start animation if it is
            if (this.geometry.isValidRangeReachable()) {
                this.startAnimation();
            }
        }
    }
    
    // Touch event handlers
    getTouchPoint(touch) {
        const rect = this.canvas.getBoundingClientRect();
        
        // Calculate touch position relative to canvas
        const x = touch.pageX - (rect.left + window.scrollX);
        const y = touch.pageY - (rect.top + window.scrollY);
        
        // Convert to model coordinates
        return this.inverseTransform({
            x: x * (this.canvas.width / rect.width),
            y: y * (this.canvas.height / rect.height)
        });
    }

    handleTouchStart(e) {
        e.preventDefault(); // Prevent scrolling while touching pivot points
        if (e.touches.length === 1) {
            const point = this.getTouchPoint(e.touches[0]);
            const hitArea = 20 / this.scale;  // Larger hit area for touch
            
            // Stop animation when starting to drag
            this.stopAnimation();
            
            // Check red points
            if (this.geometry.isPointNearRedOpenPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'red-open';
            } else if (this.geometry.isPointNearRedClosedPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'red-closed';
            } else if (this.geometry.isPointNearRedBoxPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'red-box';
            }
            // Check blue points
            else if (this.geometry.isPointNearBlueOpenPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'blue-open';
            } else if (this.geometry.isPointNearBlueClosedPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'blue-closed';
            } else if (this.geometry.isPointNearBlueBoxPoint(point, hitArea)) {
                this.isDragging = true;
                this.selectedPoint = 'blue-box';
            }
        }
    }

    handleTouchMove(e) {
        e.preventDefault(); // Prevent scrolling while dragging
        if (e.touches.length === 1 && this.isDragging) {
            const point = this.getTouchPoint(e.touches[0]);
            
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
    }

    handleTouchEnd(e) {
        this.handleMouseUp();
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
        
        // Initialize four-bar linkage
        this.geometry.initializeFourBar();
        this.geometry.fourBarConfig = this.geometry.getFourBarConfig();
        
        this.geometry.isAnimating = true;  // Set animation flag
        
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
            
            this.geometry.isAnimating = false;
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
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    
    getMousePoint(e) {
        // Get canvas bounding rect relative to viewport
        const rect = this.canvas.getBoundingClientRect();
        
        // Calculate mouse position relative to canvas
        const x = e.clientX - (rect.left);
        const y = e.clientY - (rect.top);
        
        // Convert to model coordinates
        return this.inverseTransform({
            x: x * (this.canvas.width / rect.width),  // Account for DPI scaling
            y: y * (this.canvas.height / rect.height)
        });
    }
    
    generateTemplate() {
        const bounds = this.geometry.getTemplateBounds();
        
        // Get selected units and conversion factors for PDF (which uses cm)
        const selectedUnit = document.querySelector('input[name="units"]:checked').value;
        const unitConversions = {
            mm: { toCm: 0.1, label: 'mm', scaleLength: 100 },    // divide by 10 to convert mm to cm
            cm: { toCm: 1, label: 'cm', scaleLength: 10 },       // no conversion needed
            in: { toCm: 2.54, label: 'in', scaleLength: 3 }      // multiply by 2.54 to convert inches to cm
        };
        const unitConv = unitConversions[selectedUnit];
        
        // Create initial PDF (we'll set size per page)
        const { jsPDF } = window.jspdf;
        const margin = 0.5;  // 0.5cm margin
        
        // Initialize PDF with a temporary size - we'll add properly sized pages
        const pdf = new jsPDF('p', 'cm', [21, 29.7]);  // A4 portrait as initial size
        
        // Helper functions for drawing
        const drawBoxOutline = (transform) => {
            pdf.setDrawColor(0);
            pdf.setLineWidth(0.01);
            
            const boxVertices = this.geometry.getBoxVertices();
            for (let i = 0; i < boxVertices.length; i++) {
                const p1 = boxVertices[i];
                const p2 = boxVertices[(i + 1) % boxVertices.length];
                
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            }
        };
        
        const drawClosedLidOutline = (transform) => {
            pdf.setDrawColor(100);
            pdf.setLineWidth(0.01);
            
            const lidVertices = this.geometry.getClosedLidVertices();
            for (let i = 0; i < lidVertices.length; i++) {
                const p1 = lidVertices[i];
                const p2 = lidVertices[(i + 1) % lidVertices.length];
                
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            }
        };
        
        const drawPivotPoints = (transform) => {
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
        };
        
        const drawConnectionLines = (transform, withLabels = true, fontSize = 8) => {
            const drawConnection = (p1, p2, color) => {
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                
                pdf.setDrawColor(color === 'red' ? '#ff0000' : '#0000ff');
                pdf.setLineWidth(0.01);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
                
                if (withLabels) {
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    
                    const midX = (tp1.x + tp2.x) / 2;
                    const midY = (tp1.y + tp2.y) / 2;
                    
                    pdf.setFontSize(fontSize);
                    pdf.setTextColor(color === 'red' ? '#ff0000' : '#0000ff');
                    const text = `${length.toFixed(1)}${unitConv.label}`;
                    const textWidth = pdf.getTextWidth(text);
                    pdf.text(text, midX - textWidth/2, midY - 0.15);
                    pdf.setTextColor(0);
                }
            };
            
            drawConnection(this.geometry.redBoxPoint, this.geometry.redClosedPoint, 'red');
            drawConnection(this.geometry.blueBoxPoint, this.geometry.blueClosedPoint, 'blue');
        };
        
        const drawScaleLine = (pageWidth, pageHeight, fontSize = 8) => {
            // Calculate scale length to fit within the page width
            const maxScaleLength = pageWidth - 2 * margin;
            let scaleLength = unitConv.scaleLength;
            let scaleLengthCm = scaleLength * unitConv.toCm;
            
            // Adjust scale length if it's too big
            while (scaleLengthCm > maxScaleLength && scaleLength > 1) {
                scaleLength = Math.floor(scaleLength / 2);
                scaleLengthCm = scaleLength * unitConv.toCm;
            }
            
            const scaleStartX = margin;
            const scaleLineY = pageHeight - margin;
            const scaleEndX = scaleStartX + scaleLengthCm;
            
            pdf.setDrawColor(0);
            pdf.setLineWidth(0.02);
            pdf.line(scaleStartX, scaleLineY, scaleEndX, scaleLineY);
            
            pdf.line(scaleStartX, scaleLineY - 0.1, scaleStartX, scaleLineY + 0.1);
            pdf.line(scaleEndX, scaleLineY - 0.1, scaleEndX, scaleLineY + 0.1);
            
            pdf.setFontSize(fontSize);
            const text = `${scaleLength}${unitConv.label}`;
            const textWidth = pdf.getTextWidth(text);
            pdf.text(text, (scaleStartX + scaleEndX) / 2 - textWidth/2, scaleLineY + 0.3);
        };
        
        // Page 1: Template with pivot points - size based on template bounds
        const page1Width = bounds.maxX * unitConv.toCm - bounds.minX * unitConv.toCm + 2 * margin;
        const page1Height = bounds.maxY * unitConv.toCm - bounds.minY * unitConv.toCm + 2 * margin;
        const page1Orientation = page1Width > page1Height ? 'l' : 'p';
        
        // Calculate font size based on page dimensions
        const page1FontSize = Math.min(8, Math.max(6, Math.min(page1Width, page1Height) / 10));
        
        // Remove the default first page and add our custom sized one
        pdf.deletePage(1);
        pdf.addPage([Math.max(page1Width, page1Height), Math.min(page1Width, page1Height)], page1Orientation);
        
        // Transform for page 1 (template view)
        const transformTemplate = (point) => ({
            x: point.x * unitConv.toCm - bounds.minX * unitConv.toCm + margin,
            y: bounds.maxY * unitConv.toCm - point.y * unitConv.toCm + margin
        });
        
        drawBoxOutline(transformTemplate);
        drawClosedLidOutline(transformTemplate);
        drawPivotPoints(transformTemplate);
        drawConnectionLines(transformTemplate, true, page1FontSize);
        drawScaleLine(page1Width, page1Height, page1FontSize);
        
        // Page 2: Text information - size based on text content
        const textMargin = 1;  // Larger margin for text page
        const lineHeight = 0.5;  // Height between lines
        const textWidth = 8;  // Width needed for text content
        const textHeight = 4;  // Height needed for text content
        const page2Width = textWidth + 2 * textMargin;
        const page2Height = textHeight + 2 * textMargin;
        const page2Orientation = page2Width > page2Height ? 'l' : 'p';
        
        pdf.addPage([Math.max(page2Width, page2Height), Math.min(page2Width, page2Height)], page2Orientation);
        
        pdf.setFontSize(10);
        const redLength = Math.sqrt(
            Math.pow(this.geometry.redClosedPoint.x - this.geometry.redBoxPoint.x, 2) +
            Math.pow(this.geometry.redClosedPoint.y - this.geometry.redBoxPoint.y, 2)
        );
        const blueLength = Math.sqrt(
            Math.pow(this.geometry.blueClosedPoint.x - this.geometry.blueBoxPoint.x, 2) +
            Math.pow(this.geometry.blueClosedPoint.y - this.geometry.blueBoxPoint.y, 2)
        );
        
        pdf.text(`Box dimensions: ${this.geometry.width.toFixed(1)}${unitConv.label} wide \u00D7 ${this.geometry.height.toFixed(1)}${unitConv.label} tall`, textMargin, textMargin);
        pdf.text(`Lid angle: ${Math.round(this.geometry.closedAngle * 180 / Math.PI)}\u00B0, depth: ${this.geometry.depth.toFixed(1)}${unitConv.label}`, textMargin, textMargin + lineHeight);
        pdf.text(`Gap when open: ${this.geometry.gap.toFixed(1)}${unitConv.label}`, textMargin, textMargin + lineHeight * 2);
        pdf.text(`Rod lengths:`, textMargin, textMargin + lineHeight * 4);
        pdf.setTextColor('#ff0000');
        pdf.text(`  Red: ${redLength.toFixed(1)}${unitConv.label}`, textMargin + 1, textMargin + lineHeight * 5);
        pdf.setTextColor('#0000ff');
        pdf.text(`  Blue: ${blueLength.toFixed(1)}${unitConv.label}`, textMargin + 1, textMargin + lineHeight * 6);
        pdf.setTextColor(0);
        
        // Full template page with complete box outline
        const getFullTemplateBounds = () => {
            const points = [
                ...this.geometry.getBoxVertices(),
                ...this.geometry.getClosedLidVertices(),
                this.geometry.redBoxPoint,
                this.geometry.blueBoxPoint
            ];
            
            const bounds = {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
            };
            
            points.forEach(p => {
                bounds.minX = Math.min(bounds.minX, p.x);
                bounds.maxX = Math.max(bounds.maxX, p.x);
                bounds.minY = Math.min(bounds.minY, p.y);
                bounds.maxY = Math.max(bounds.maxY, p.y);
            });
            
            return bounds;
        };
        
        const fullTemplateBounds = getFullTemplateBounds();
        const fullTemplateWidth = (fullTemplateBounds.maxX - fullTemplateBounds.minX) * unitConv.toCm + 2 * margin;
        const fullTemplateHeight = (fullTemplateBounds.maxY - fullTemplateBounds.minY) * unitConv.toCm + 2 * margin;
        const fullTemplateOrientation = fullTemplateWidth > fullTemplateHeight ? 'l' : 'p';
        
        // Calculate font size based on page dimensions
        const fullTemplateFontSize = Math.min(8, Math.max(6, Math.min(fullTemplateWidth, fullTemplateHeight) / 10));
        
        pdf.addPage([Math.max(fullTemplateWidth, fullTemplateHeight), Math.min(fullTemplateWidth, fullTemplateHeight)], fullTemplateOrientation);
        
        // Transform for full template view
        const transformFullTemplate = (point) => ({
            x: (point.x - fullTemplateBounds.minX) * unitConv.toCm + margin,
            y: (fullTemplateBounds.maxY - point.y) * unitConv.toCm + margin
        });
        
        drawBoxOutline(transformFullTemplate);
        drawClosedLidOutline(transformFullTemplate);
        drawPivotPoints(transformFullTemplate);
        drawConnectionLines(transformFullTemplate, true, fullTemplateFontSize);
        drawScaleLine(fullTemplateWidth, fullTemplateHeight, fullTemplateFontSize);
        
        // Save the PDF
        pdf.save('hinge-template.pdf');
    }
}
