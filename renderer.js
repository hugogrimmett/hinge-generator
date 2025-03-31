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
        
        // Add link length constraint checkbox listener
        const constrainLinkLengthsCheckbox = document.getElementById('constrainLinkLengths');
        if (constrainLinkLengthsCheckbox) {
            constrainLinkLengthsCheckbox.addEventListener('change', (e) => {
                this.geometry.constrainLinkLengths = e.target.checked;
                if (e.target.checked) {
                    // When enabling constraint, make both links the same length as the red link
                    const redLinkLength = this.geometry.distance(this.geometry.redBoxPoint, this.geometry.redOpenPoint);
                    const lidVertices = this.geometry.getOpenLidVertices();
                    
                    // Try to adjust blue points to match red link length while staying in bounds
                    const result = this.geometry.adjustPointWithConstraints(
                        this.geometry.blueOpenPoint,
                        this.geometry.blueBoxPoint,
                        redLinkLength,
                        lidVertices
                    );
                    
                    if (result) {
                        this.geometry.blueOpenPoint = result.openPoint;
                        this.geometry.blueBoxPoint = result.boxPoint;
                        this.geometry.updateBlueClosedPoint();
                        this.geometry.updateConstraintLines();
                        this.draw();
                    } else {
                        // If no valid solution found, try adjusting red points to match blue length
                        const blueLinkLength = this.geometry.distance(this.geometry.blueBoxPoint, this.geometry.blueOpenPoint);
                        const redResult = this.geometry.adjustPointWithConstraints(
                            this.geometry.redOpenPoint,
                            this.geometry.redBoxPoint,
                            blueLinkLength,
                            lidVertices
                        );
                        
                        if (redResult) {
                            this.geometry.redOpenPoint = redResult.openPoint;
                            this.geometry.redBoxPoint = redResult.boxPoint;
                            this.geometry.updateRedClosedPoint();
                            this.geometry.updateConstraintLines();
                            this.draw();
                        } else {
                            // If neither works, uncheck the box
                            e.target.checked = false;
                            this.geometry.constrainLinkLengths = false;
                        }
                    }
                }
            });
        }
        
        // Animation state
        this.geometry.isAnimating = true;
        this.animationTime = 0;
        this.animationDuration = 2500;  // 2 seconds for a full cycle
        this.lastTimestamp = null;
        
        // Initialize geometry and draw
        this.geometry.initializeFourBar();
        
        // Start animation if configuration is valid
        if (this.geometry.isValidRangeReachable()) {
            this.startAnimation();
        } else {
            this.draw();
        }
        
        // Help text state
        this.helpTextOpacity = 1;
        this.showHelpText = true;
        this.lastInteractionTime = 0;
    }
    
    updateParameters(h, w, d, alpha, g) {
        // Store current pivot positions
        const boxPivotPositions = this.geometry.getBoxPivotPositions();
        const lidPivotPositions = this.geometry.getLidPivotPositions();
        
        // Create new geometry with updated parameters
        this.geometry = new BoxGeometry(h, w, d, alpha, g);
        
        // Initialize center of rotation first since it only depends on the box geometry, not the pivot positions
        this.geometry.centerOfRotation = {  
            x: (w - g)/2,
            y: h
        };
        
        // Initialize pivot points (which will use the new COR)
        this.geometry.initializePivotPoints();

        // Then restore lid pivot positions first
        if (lidPivotPositions) {
            this.geometry.setLidPivotPositions(lidPivotPositions);
        }
      
        // Then update the constraint lines since they depend on the lid pivot positions
        this.geometry.updateConstraintLines();        
        
        // Update closed points based on new lid pivot positions and constraint lines
        this.geometry.updateRedOpenPoint();
        this.geometry.updateBlueOpenPoint();
        
        // Finally, restore box pivot positions which are dependent on all the rest
        if (boxPivotPositions) {
            this.geometry.setBoxPivotPositions(boxPivotPositions);
        }
        
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
        ctx.fillStyle = 'rgba(200, 200, 200, 0.1)';
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
        ctx.fillStyle = 'rgba(200, 200, 200, 0.1)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    
    // Draw connection line
    drawConnectionLine(line, color) {
        const ctx = this.ctx;
        
        const start = this.transform(line.start);
        const end = this.transform(line.end);
        
        // Reset line dash
        ctx.setLineDash([]);
        
        // Draw perpendicular line from box pivot point to constraint line
        ctx.beginPath();
        ctx.setLineDash([2, 2]);  // Dotted line
        ctx.strokeStyle = color === 'red' ? '#ff8080' : color === 'blue' ? '#80b3ff' : `${color}33`;  // Lighter but still vibrant
        
        const boxPoint = this.transform(line.boxPoint);
        
        // Calculate perpendicular line endpoint on the constraint line
        // First, get vector from start to end of constraint line
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        
        // Calculate projection of box point onto constraint line
        const t = ((boxPoint.x - start.x) * dx + (boxPoint.y - start.y) * dy) / (dx * dx + dy * dy);
        const projX = start.x + t * dx;
        const projY = start.y + t * dy;
        
        // Draw perpendicular line from box point to projection point
        ctx.moveTo(boxPoint.x, boxPoint.y);
        ctx.lineTo(projX, projY);
        ctx.stroke();
        ctx.setLineDash([]);  // Reset dash
        
        // Draw thick connecting lines
        ctx.lineWidth = 3;
        ctx.strokeStyle = color === 'red' ? '#ff6666' : color === 'blue' ? '#4d94ff' : color;  // More vibrant
        
        // Draw dashed line from box point to open point
        ctx.beginPath();
        ctx.setLineDash([8, 8]);  // Larger dashes for thicker line
        const openPoint = this.transform(line.end);
        ctx.moveTo(boxPoint.x, boxPoint.y);
        ctx.lineTo(openPoint.x, openPoint.y);
        ctx.stroke();
        
        // Draw solid line from box point to closed point
        ctx.beginPath();
        ctx.setLineDash([]);  // Reset to solid line
        const closedPoint = this.transform(line.start);
        ctx.moveTo(boxPoint.x, boxPoint.y);
        ctx.lineTo(closedPoint.x, closedPoint.y);
        ctx.stroke();
        
        // Reset line style
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
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
        // Clear with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Check if current configuration is valid and draw error background if not
        const isValid = this.geometry.isValidRangeReachable();
        if (!isValid) {
            // Add a light pink overlay for error state
            ctx.fillStyle = 'rgba(255, 235, 235, 1)';
            ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
        }
        
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
        
        if (!isValid) {
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
        } else if (!this.isDragging && !this.animationId && this.geometry.isValidRangeReachable()) {
            // Only start animation if valid and not already animating
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
        
        // Draw help text if needed and no error
        if (this.helpTextOpacity > 0 && isValid) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.font = '20px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
            
            // Draw help text in parts to color specific words
            const text1 = 'Try moving the ';
            const text2 = 'blue';
            const text3 = ' and ';
            const text4 = 'red';
            const text5 = ' pivot points';
            
            // Measure text widths for positioning
            const width1 = ctx.measureText(text1).width;
            const width2 = ctx.measureText(text2).width;
            const width3 = ctx.measureText(text3).width;
            const width4 = ctx.measureText(text4).width;
            const totalWidth = width1 + width2 + width3 + width4 + ctx.measureText(text5).width;
            
            // Calculate start position to center everything
            const startX = this.canvas.width / 2 - totalWidth / 2;
            
            // Draw each part with appropriate color
            ctx.fillStyle = `rgba(0, 0, 0, ${this.helpTextOpacity})`;
            ctx.fillText(text1, startX + width1/2, 60);
            
            ctx.fillStyle = '#80b3ff';
            ctx.globalAlpha = this.helpTextOpacity;
            ctx.fillText(text2, startX + width1 + width2/2, 60);
            
            ctx.fillStyle = `rgba(0, 0, 0, ${this.helpTextOpacity})`;
            ctx.fillText(text3, startX + width1 + width2 + width3/2, 60);
            
            ctx.fillStyle = '#ff8080';
            ctx.globalAlpha = this.helpTextOpacity;
            ctx.fillText(text4, startX + width1 + width2 + width3 + width4/2, 60);
            
            ctx.fillStyle = `rgba(0, 0, 0, ${this.helpTextOpacity})`;
            ctx.fillText(text5, startX + width1 + width2 + width3 + width4 + ctx.measureText(text5).width/2, 60);
            
            // Draw second line normally
            ctx.fillText('to see how it affects the motion of the lid', this.canvas.width / 2, 85);
            ctx.restore();
            
            // Fade out if we're no longer showing
            if (!this.showHelpText && Date.now() - this.lastInteractionTime > 300) {
                this.helpTextOpacity = Math.max(0, this.helpTextOpacity - 0.01); // Slower fade
            }
        }
        
        // Draw constraint distances (always on top)
        const dots = this.geometry.getConstraintDotProducts();
        if (dots && dots.distance_red !== undefined && dots.distance_blue !== undefined) {
            ctx.save();
            ctx.font = '12px monospace';
            ctx.fillStyle = 'black';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`Red dot: ${dots.distance_red.toFixed(3)}`, 10, 10);
            ctx.fillText(`Blue dot: ${dots.distance_blue.toFixed(3)}`, 10, 30);
            ctx.fillText(`Center: ${dots.center.x.toFixed(3)}, ${dots.center.y.toFixed(3)}`, 10, 50);
            ctx.restore();
            if (redLine) {
                this.drawCircle(dots.red_point, 2, 'green');
                this.drawCircle(dots.red_point2, 2, 'green');
                const red_points_transformed = this.transform(dots.red_point);
                const red_points2_transformed = this.transform(dots.red_point2);
                ctx.beginPath();
                ctx.strokeStyle = 'green';
                ctx.lineWidth = 1;
                ctx.moveTo(red_points_transformed.x, red_points_transformed.y);
                ctx.lineTo(red_points2_transformed.x, red_points2_transformed.y);
                ctx.stroke();
            }
            this.drawCircle(dots.center, 2, 'green');
            
            if (blueLine) {
                this.drawCircle(dots.blue_point, 2, 'green');
                this.drawCircle(dots.blue_point2, 2, 'green');
                const blue_points_transformed = this.transform(dots.blue_point);
                const blue_points2_transformed = this.transform(dots.blue_point2);
                ctx.beginPath();
                ctx.strokeStyle = 'green';
                ctx.lineWidth = 1;
                ctx.moveTo(blue_points_transformed.x, blue_points_transformed.y);
                ctx.lineTo(blue_points2_transformed.x, blue_points2_transformed.y);
                ctx.stroke();       
            }
        }
    }
    
    // Mouse event handlers
    handleMouseDown(e) {
        // Hide help text on first interaction
        if (this.showHelpText) {
            this.showHelpText = false;
            this.lastInteractionTime = Date.now();
        }
        
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
            if (pointType === 'closed') {
                this.geometry.moveRedClosedPoint(point);
            } else if (pointType === 'open') {
                // For open point, move the closed point to the opposite position
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                this.geometry.moveRedClosedPoint({
                    x: center.x - dx,
                    y: center.y - dy
                });
            } else if (pointType === 'box') {
                this.geometry.moveRedBoxPoint(point);
            }
        } else { // blue
            if (pointType === 'closed') {
                this.geometry.moveBlueClosedPoint(point);
            } else if (pointType === 'open') {
                // For open point, move the closed point to the opposite position
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                this.geometry.moveBlueClosedPoint({
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
        window.updateUrl();
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
            x: x * (this.canvas.width / rect.width),  // Account for DPI scaling
            y: y * (this.canvas.height / rect.height)
        });
    }

    handleTouchStart(e) {
        e.preventDefault(); // Prevent scrolling while touching pivot points
        if (e.touches.length === 1) {
            const point = this.getTouchPoint(e.touches[0]);
            const hitArea = 20 / this.scale;  // Larger hit area for touch
            
            // Hide help text on first interaction
            if (this.showHelpText) {
                this.showHelpText = false;
                this.lastInteractionTime = Date.now();
            }
            
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
                if (pointType === 'closed') {
                    this.geometry.moveRedClosedPoint(point);
                } else if (pointType === 'open') {
                    // For open point, move the closed point to the opposite position
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    this.geometry.moveRedClosedPoint({
                        x: center.x - dx,
                        y: center.y - dy
                    });
                } else if (pointType === 'box') {
                    this.geometry.moveRedBoxPoint(point);
                }
            } else { // blue
                if (pointType === 'closed') {
                    this.geometry.moveBlueClosedPoint(point);
                } else if (pointType === 'open') {
                    // For open point, move the closed point to the opposite position
                    const dx = point.x - center.x;
                    const dy = point.y - center.y;
                    this.geometry.moveBlueClosedPoint({
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
            window.updateUrl();
        }
    }

    handleTouchEnd(e) {
        this.handleMouseUp();
    }
    
    // Animation loop
    animate() {
        this.draw();
        requestAnimationFrame(this.animate.bind(this));
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
            
            // Apply easing to progress
            progress = (1 - Math.cos(progress * Math.PI)) / 2;
            
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
            // Just redraw without modifying the configuration
            this.draw();
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
            mm: { toUnit: 0.1, label: 'mm', scaleLength: 100 },    // divide by 10 to convert mm to cm
            cm: { toUnit: 1, label: 'cm', scaleLength: 10 },       // no conversion needed
            in: { toUnit: 2.54, label: 'in', scaleLength: 3 }      // multiply by 2.54 to convert inches to cm
        };
        const unitConv = unitConversions[selectedUnit];
        
        // Create initial PDF (we'll set size per page)
        const { jsPDF } = window.jspdf;
        const margin = 0.5;  // 0.5cm margin
        
        // Initialize PDF with a temporary size - we'll add properly sized pages
        const pdf = new jsPDF('p', 'cm', [21, 29.7]);  // A4 portrait as initial size
        
        // Helper functions for drawing
        const drawBoxOutline = (transform) => {
            pdf.setDrawColor(40);  // Dark gray instead of pure black
            pdf.setLineWidth(0.015);  // Slightly thicker lines
            
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
            pdf.setDrawColor(120);  // Lighter gray for lid
            pdf.setLineWidth(0.015);  // Match box line weight
            pdf.setLineDashPattern([0.05, 0.05], 0);  // Dotted line for lid
            
            const lidVertices = this.geometry.getClosedLidVertices();
            for (let i = 0; i < lidVertices.length; i++) {
                const p1 = lidVertices[i];
                const p2 = lidVertices[(i + 1) % lidVertices.length];
                
                const tp1 = transform(p1);
                const tp2 = transform(p2);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
            }
            pdf.setLineDashPattern([], 0);  // Reset dash
        };
        
        const drawPivotPoints = (transform) => {
            const points = [
                { point: this.geometry.redBoxPoint, color: '#E63946' },  // Warmer red
                { point: this.geometry.blueBoxPoint, color: '#457B9D' }, // Muted blue
                { point: this.geometry.redClosedPoint, color: '#E63946' },
                { point: this.geometry.blueClosedPoint, color: '#457B9D' }
            ];
            
            const radius = 0.08;  // Slightly smaller points
            pdf.setLineWidth(0.01);
            for (const {point, color} of points) {
                const p = transform(point);
                pdf.setFillColor(color);
                pdf.circle(p.x, p.y, radius, 'F');
                // Add subtle border
                pdf.setDrawColor(40);
                pdf.circle(p.x, p.y, radius, 'S');
            }
        };
        
        const drawConnectionLines = (transform, withLabels = true, fontSize = 8) => {
            const drawConnection = (boxPoint, lidPoint, color) => {
                const tp1 = transform(boxPoint);
                const tp2 = transform(lidPoint);
                
                pdf.lineWidth = 3;
                pdf.setDrawColor(color === '#E63946' ? '#E63946' : color === '#457B9D' ? '#457B9D' : color);
                pdf.line(tp1.x, tp1.y, tp2.x, tp2.y);
                
                // Calculate length in model units
                const length = Math.sqrt(
                    Math.pow(boxPoint.x - lidPoint.x, 2) + 
                    Math.pow(boxPoint.y - lidPoint.y, 2)
                );

                // Position text at midpoint of line
                const midX = (tp1.x + tp2.x) / 2;
                const midY = (tp1.y + tp2.y) / 2;
                
                // Draw length label using current unit system
                pdf.setFontSize(fontSize);
                pdf.setTextColor(40);
                pdf.text(`${(length).toFixed(1)}${unitConv.label}`, midX, midY);
            };
            
            // Draw lines between red and blue pivot points
            drawConnection(this.geometry.redBoxPoint, this.geometry.redClosedPoint, '#E63946');
            drawConnection(this.geometry.blueBoxPoint, this.geometry.blueClosedPoint, '#457B9D');
            
            pdf.lineWidth = 1;
            pdf.setTextColor(40);  // Reset text color
        };
        
        const drawScaleLine = (pageWidth, pageHeight, fontSize = 8) => {
            // Calculate scale length to fit within the page width
            const maxScaleLength = pageWidth - 2 * margin;
            let scaleLength = unitConv.scaleLength;
            let scaleLengthCm = scaleLength * unitConv.toUnit;
            
            while (scaleLengthCm > maxScaleLength && scaleLength > 1) {
                scaleLength = Math.floor(scaleLength / 2);
                scaleLengthCm = scaleLength * unitConv.toUnit;
            }
            
            const scaleStartX = margin;
            const scaleLineY = pageHeight - margin;
            const scaleEndX = scaleStartX + scaleLengthCm;
            
            // Draw scale line with modern style
            pdf.setDrawColor(40);
            pdf.setLineWidth(0.02);
            pdf.line(scaleStartX, scaleLineY, scaleEndX, scaleLineY);
            
            // End ticks with subtle extension
            const tickHeight = 0.15;
            pdf.setLineWidth(0.015);
            pdf.line(scaleStartX, scaleLineY - tickHeight/2, scaleStartX, scaleLineY + tickHeight/2);
            pdf.line(scaleEndX, scaleLineY - tickHeight/2, scaleEndX, scaleLineY + tickHeight/2);
            
            // Scale label with background
            pdf.setFontSize(fontSize);
            const text = `${scaleLength}${unitConv.label}`;
            const textWidth = pdf.getTextWidth(text);
            const padding = 0.1;
            
            const textX = (scaleStartX + scaleEndX) / 2 - textWidth/2;
            const textY = scaleLineY + 0.3;
            
            // White background for better readability
            pdf.setFillColor(255);
            pdf.rect(textX - padding, textY - fontSize/72*2.54, 
                    textWidth + padding*2, fontSize/72*2.54 + padding*2, 'F');
            
            pdf.setTextColor(40);
            pdf.text(text, textX, textY);
        };
        
        // Page 1: Template with pivot points - size based on template bounds
        const page1Width = bounds.maxX * unitConv.toUnit - bounds.minX * unitConv.toUnit + 2 * margin;
        const page1Height = bounds.maxY * unitConv.toUnit - bounds.minY * unitConv.toUnit + 2 * margin;
        const page1Orientation = page1Width > page1Height ? 'l' : 'p';
        
        // Calculate font size based on page dimensions
        const page1FontSize = Math.min(8, Math.max(6, Math.min(page1Width, page1Height) / 10));
        
        // Remove the default first page and add our custom sized one
        pdf.deletePage(1);
        pdf.addPage([Math.max(page1Width, page1Height), Math.min(page1Width, page1Height)], page1Orientation);
        
        // Transform for page 1 (template view)
        const transformTemplate = (point) => ({
            x: point.x * unitConv.toUnit - bounds.minX * unitConv.toUnit + margin,
            y: bounds.maxY * unitConv.toUnit - point.y * unitConv.toUnit + margin
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
        const fullTemplateWidth = (fullTemplateBounds.maxX - fullTemplateBounds.minX) * unitConv.toUnit + 2 * margin;
        const fullTemplateHeight = (fullTemplateBounds.maxY - fullTemplateBounds.minY) * unitConv.toUnit + 2 * margin;
        const fullTemplateOrientation = fullTemplateWidth > fullTemplateHeight ? 'l' : 'p';
        
        // Calculate font size based on page dimensions
        const fullTemplateFontSize = Math.min(8, Math.max(6, Math.min(fullTemplateWidth, fullTemplateHeight) / 10));
        
        pdf.addPage([Math.max(fullTemplateWidth, fullTemplateHeight), Math.min(fullTemplateWidth, fullTemplateHeight)], fullTemplateOrientation);
        
        // Transform for full template view
        const transformFullTemplate = (point) => ({
            x: (point.x - fullTemplateBounds.minX) * unitConv.toUnit + margin,
            y: (fullTemplateBounds.maxY - point.y) * unitConv.toUnit + margin
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
