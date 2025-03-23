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
        
        // Center viewport in canvas
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
        
        // Animation controls
        const animateButton = document.getElementById('animateButton');
        if (animateButton) {
            animateButton.addEventListener('click', () => {
                if (this.geometry.isAnimating) {
                    this.stopAnimation();
                    animateButton.textContent = 'Animate';
                } else {
                    this.startAnimation();
                    animateButton.textContent = 'Stop';
                }
            });
        }
        
        // Animation state
        this.geometry.isAnimating = false;
        this.animationTime = 0;
        this.animationDuration = 2000;  // 4 seconds for a full cycle
        this.lastTimestamp = null;
        
        // Initialize geometry and draw
        this.geometry.initializeFourBar();
        this.draw();
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
        ctx.font = `${baseFontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
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
        
        // Check if current configuration is valid
        if (this.geometry.fourBarConfig) {
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
            }
            
            // Start animation if valid and not dragging
            if (isValid && !this.isDragging && !this.animationId) {
                this.startAnimation();
            }
        }
        
        // Draw box outline
        this.drawBox();
        
        // Draw lid in both positions
        this.drawLid(this.geometry.getClosedLidVertices(), 'black');
        this.drawLid(this.geometry.getOpenLidVertices(), 'black');
        
        // Draw moving lid if available
        const movingLidVertices = this.geometry.getMovingLidVertices();
        if (movingLidVertices) {
            this.drawLid(movingLidVertices, '#66c2a588');  // Semi-transparent teal
        }
        
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
        
        // Draw four-bar linkage if initialized
        const fb = this.geometry.fourBarConfig;
        if (fb) {
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
        this.isDragging = false;
        this.selectedPoint = null;
        
        // Try to restart animation
        if (this.geometry.fourBarConfig && this.geometry.isValidRangeReachable()) {
            this.startAnimation();
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
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    
    getMousePoint(e) {
        // Get canvas bounding rect relative to viewport
        const rect = this.canvas.getBoundingClientRect();
        
        // Calculate mouse position relative to canvas
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Convert to model coordinates
        return this.inverseTransform({
            x: x * (this.canvas.width / rect.width),  // Account for DPI scaling
            y: y * (this.canvas.height / rect.height)
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
        const pdfWidth = bounds.right - bounds.left + 2 * margin;  // Use absolute coordinates
        const pdfHeight = bounds.top - bounds.bottom + 2 * margin;
        console.log('PDF dimensions:', { pdfWidth, pdfHeight });
        const pdf = new jsPDF('p', 'cm', [pdfWidth, pdfHeight]);
        
        // Transform from model coordinates to PDF coordinates
        // No scaling needed since we want 1:1, just translate to add margins and flip Y
        const transform = (point) => {
            const transformed = {
                x: point.x - bounds.left + margin,
                y: pdfHeight - (point.y - bounds.bottom + margin)
            };
            console.log('Transform:', { 
                from: point,
                to: transformed,
                pdfWidth,
                pdfHeight
            });
            return transformed;
        };
        
        // Helper to check if point is within bounds
        const isInBounds = (point) => {
            return true;
        };
        
        // Draw box outline
        pdf.setDrawColor(0);
        pdf.setLineWidth(0.01);
        
        const boxVertices = this.geometry.getBoxVertices();
        // Make vertices relative to template bounds
        const relativeBoxVertices = boxVertices.map(p => ({
            x: p.x + bounds.left,
            y: p.y
        }));
        
        for (let i = 0; i < relativeBoxVertices.length; i++) {
            const p1 = relativeBoxVertices[i];
            const p2 = relativeBoxVertices[(i + 1) % relativeBoxVertices.length];
            
            const tp1 = transform(p1);
            const tp2 = transform(p2);
            pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
        }
        
        // Draw closed lid outline
        const closedLidVertices = this.geometry.getClosedLidVertices();
        // Make vertices relative to template bounds
        const relativeLidVertices = closedLidVertices.map(p => ({
            x: p.x + bounds.left,
            y: p.y
        }));
        
        pdf.setDrawColor(100);
        for (let i = 0; i < relativeLidVertices.length; i++) {
            const p1 = relativeLidVertices[i];
            const p2 = relativeLidVertices[(i + 1) % relativeLidVertices.length];
            
            const tp1 = transform(p1);
            const tp2 = transform(p2);
            pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
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
