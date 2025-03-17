class HingeMechanism {
    constructor(h, w, d, alpha, g) {
        this.h = h;
        this.w = w;
        this.d = d;
        this.alpha = alpha;
        this.g = g;
        
        // Calculate viewport bounds
        this.viewportBounds = {
            left: -this.h,
            right: 1.25 * this.w,
            bottom: -0.25 * this.h,
            top: 2.25 * this.h
        };
        
        // Calculate scale to fit viewport in canvas
        const padding = 50;  // pixels
        this.scale = Math.min(
            (800 - 2 * padding) / (this.viewportBounds.right - this.viewportBounds.left),
            (600 - 2 * padding) / (this.viewportBounds.top - this.viewportBounds.bottom)
        );
        
        // Calculate offset to center the viewport
        this.offset = {
            x: padding - this.viewportBounds.left * this.scale,
            y: 600 - padding + this.viewportBounds.bottom * this.scale  // Flip y-axis
        };
        
        this.pivots = this.solvePivotPoints();
        this.animationStartTime = null;
        this.animating = false;
        this.animationDuration = 3000;
        this.viewMode = 'closed';
    }

    // Calculate lid vertices for closed (0) or open (100) position
    getLidVertices(position) {
        const alphaRad = this.alpha * Math.PI / 180;
        const criticalAngle = Math.atan2(this.h, this.d) * 180 / Math.PI;
        
        if (position === 0) {
            // Closed position
            if (this.alpha <= criticalAngle) {
                // Triangle case
                return {
                    A: { x: 0, y: this.h },
                    B: { x: this.d, y: this.h },
                    C: { x: 0, y: this.h - this.d * Math.tan(alphaRad) }
                };
            } else {
                // Quadrilateral case
                return {
                    A: { x: 0, y: this.h },
                    B: { x: this.d, y: this.h },
                    C: { x: this.d - this.h / Math.tan(alphaRad), y: 0 },
                    D: { x: 0, y: 0 }
                };
            }
        } 
        else if (position === 100) {
            // Open position
            if (this.alpha <= criticalAngle) {
                // Triangle case
                return {
                    A: { x: this.w - this.g, y: this.h },
                    B: { x: this.w - this.g - this.d, y: this.h },
                    C: { x: this.w - this.g, y: this.h + this.d * Math.tan(alphaRad) }
                };
            } else {
                // Quadrilateral case
                return {
                    A: { x: this.w - this.g, y: this.h },
                    B: { x: this.w - this.g - this.d, y: this.h },
                    C: { x: this.w - this.g - this.d + this.h / Math.tan(alphaRad), y: 2 * this.h },
                    D: { x: this.w - this.g, y: 2 * this.h }
                };
            }
        }
        else {
            console.error('Only closed (0) and open (100) positions supported');
            return this.getLidVertices(0);
        }
    }

    // Calculate pivot points that ensure legal motion
    solvePivotPoints() {
        // Initial guess for pivot points - place them to allow rotation
        const vars = [
            -this.d * 0.5, this.h * 1.2,  // First box pivot (outside and above)
            0, this.h,                     // First lid pivot
            -this.d * 0.25, this.h * 1.3,  // Second box pivot
            this.d, this.h                 // Second lid pivot
        ];
        
        // Solve using Newton-Raphson
        const solution = this.newtonRaphson(
            x => this.equations(x),
            x => this.numericalJacobian(x),
            vars
        );
        
        if (!solution) {
            console.error('Failed to solve for pivot points, using initial guess');
            return {
                rod1: {
                    box: { x: vars[0], y: vars[1] },
                    lid: { x: vars[2], y: vars[3] }
                },
                rod2: {
                    box: { x: vars[4], y: vars[5] },
                    lid: { x: vars[6], y: vars[7] }
                }
            };
        }
        
        const [x1, y1, x2, y2, x3, y3, x4, y4] = solution;
        return {
            rod1: {
                box: { x: x1, y: y1 },
                lid: { x: x2, y: y2 }
            },
            rod2: {
                box: { x: x3, y: y3 },
                lid: { x: x4, y: y4 }
            }
        };
    }

    // Solve system using Newton-Raphson
    newtonRaphson(equations, jacobian, x0) {
        const maxIter = 100;
        const tolerance = 1e-6;
        
        let vars = x0;
        
        for (let iter = 0; iter < maxIter; iter++) {
            const f = equations(vars);
            
            // Check if we're close enough to solution
            if (Math.max(...f.map(Math.abs)) < tolerance) {
                break;
            }
            
            // Get Jacobian
            const J = jacobian(vars);
            
            // Solve J * dx = -f using Gaussian elimination
            const dx = this.solveLinearSystem(J, f.map(x => -x));
            
            // Update variables
            vars = vars.map((x, i) => x + dx[i]);
        }
        
        return vars;
    }

    // Numerical derivative of equations for Newton-Raphson
    numericalJacobian(vars) {
        const h = 1e-7;
        const f0 = this.equations(vars);
        const n = vars.length;
        const jacobian = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            const varsCopy = [...vars];
            varsCopy[i] += h;
            const f1 = this.equations(varsCopy);
            
            for (let j = 0; j < n; j++) {
                jacobian[j][i] = (f1[j] - f0[j]) / h;
            }
        }
        
        return jacobian;
    }

    // System of equations for 4-bar linkage
    equations(vars) {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = vars;
        const alphaRad = this.alpha * Math.PI / 180;
        
        // Points in closed position
        const closedA = { x: 0, y: this.h };
        const closedB = { x: this.d, y: this.h };
        const closedC = { x: 0, y: this.h - this.d * Math.tan(alphaRad) };
        
        // Points in open position
        const openA = { x: this.w - this.g, y: this.h };  // Negative g moves left
        const openB = { x: this.w - this.d - this.g, y: this.h };
        const openC = { x: this.w - this.g, y: this.h + this.d * Math.tan(alphaRad) };

        // Calculate rod lengths
        const l1 = Math.sqrt((x2 - x1)**2 + (y2 - y1)**2);
        const l2 = Math.sqrt((x4 - x3)**2 + (y4 - y3)**2);
        
        // Check for intersections at several angles during motion
        const numChecks = 8;
        let intersectionPenalty = 0;
        for (let i = 0; i < numChecks; i++) {
            const angle = (i / (numChecks - 1)) * Math.PI;
            if (this.checkIntersection(vars, angle)) {
                intersectionPenalty += 1000; // Large penalty for intersection
            }
        }
        
        return [
            // Closed position constraints
            (x2 - closedA.x)**2 + (y2 - closedA.y)**2 - (x4 - closedA.x)**2 - (y4 - closedA.y)**2,
            (x2 - closedB.x)**2 + (y2 - closedB.y)**2 - (x4 - closedB.x)**2 - (y4 - closedB.y)**2,
            (x2 - closedC.x)**2 + (y2 - closedC.y)**2 - (x4 - closedC.x)**2 - (y4 - closedC.y)**2,
            
            // Open position constraints
            (x2 - openA.x)**2 + (y2 - openA.y)**2 - (x4 - openA.x)**2 - (y4 - openA.y)**2,
            (x2 - openB.x)**2 + (y2 - openB.y)**2 - (x4 - openB.x)**2 - (y4 - openB.y)**2,
            (x2 - openC.x)**2 + (y2 - openC.y)**2 - (x4 - openC.x)**2 - (y4 - openC.y)**2,
            
            // Rod length constraints
            l2 - l1 * 1.2,  // Second rod ~20% longer than first
            
            // Box pivot points should be reasonably positioned
            Math.min(x1, x3) + intersectionPenalty,  // Penalize intersections
            Math.max(y1, y3) - this.h * 1.5  // Keep pivots not too far above box
        ];
    }

    // Solve linear system Ax = b using Gaussian elimination
    solveLinearSystem(A, b) {
        const n = A.length;
        const augmented = A.map((row, i) => [...row, b[i]]);
        
        // Forward elimination
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let j = i + 1; j < n; j++) {
                if (Math.abs(augmented[j][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = j;
                }
            }
            
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
            
            for (let j = i + 1; j < n; j++) {
                const factor = augmented[j][i] / augmented[i][i];
                for (let k = i; k <= n; k++) {
                    augmented[j][k] -= factor * augmented[i][k];
                }
            }
        }
        
        // Back substitution
        const x = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = augmented[i][n];
            for (let j = i + 1; j < n; j++) {
                sum -= augmented[i][j] * x[j];
            }
            x[i] = sum / augmented[i][i];
        }
        
        return x;
    }

    // Check if lid intersects with box at given angle
    checkIntersection(vars, angle) {
        const [x1, y1, x2, y2, x3, y3, x4, y4] = vars;
        const alphaRad = this.alpha * Math.PI / 180;
        
        // Get lid vertices in closed position
        const closedA = { x: 0, y: this.h };
        const closedB = { x: this.d, y: this.h };
        const closedC = { x: 0, y: this.h - this.d * Math.tan(alphaRad) };

        // Calculate offsets from first lid pivot to vertices
        const offsetA = { x: closedA.x - x2, y: closedA.y - y2 };
        const offsetB = { x: closedB.x - x2, y: closedB.y - y2 };
        const offsetC = { x: closedC.x - x2, y: closedC.y - y2 };

        // Calculate vertices at current angle
        const vertexA = this.calculateLidVertex(
            {x: x1, y: y1}, 
            {x: x2, y: y2}, 
            angle,
            offsetA
        );
        
        const vertexB = this.calculateLidVertex(
            {x: x1, y: y1},
            {x: x2, y: y2},
            angle,
            offsetB
        );
        
        const vertexC = this.calculateLidVertex(
            {x: x1, y: y1},
            {x: x2, y: y2},
            angle,
            offsetC
        );
        
        // Check if any vertex is inside the box
        const vertices = [vertexA, vertexB, vertexC];
        for (const vertex of vertices) {
            if (vertex.x >= 0 && vertex.x <= this.w &&
                vertex.y >= 0 && vertex.y <= this.h) {
                return true; // Intersection found
            }
        }

        // Check if any edge intersects with box edges
        const edges = [
            [vertexA, vertexB],
            [vertexB, vertexC],
            [vertexC, vertexA]
        ];
        
        const boxEdges = [
            [{x: 0, y: 0}, {x: this.w, y: 0}],
            [{x: this.w, y: 0}, {x: this.w, y: this.h}],
            [{x: this.w, y: this.h}, {x: 0, y: this.h}],
            [{x: 0, y: this.h}, {x: 0, y: 0}]
        ];

        for (const edge of edges) {
            for (const boxEdge of boxEdges) {
                if (this.lineSegmentsIntersect(edge[0], edge[1], boxEdge[0], boxEdge[1])) {
                    return true; // Intersection found
                }
            }
        }

        return false;
    }

    // Helper function to check if two line segments intersect
    lineSegmentsIntersect(p1, p2, p3, p4) {
        const ccw = (A, B, C) => {
            return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        };
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    // Calculate position of lid vertex given pivot points and angle
    calculateLidVertex(boxPivot, lidPivot, angle, vertexOffset) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Vector from lid pivot to vertex in local coordinates
        const dx = vertexOffset.x;
        const dy = vertexOffset.y;
        
        // Rotate and translate to world coordinates
        return {
            x: lidPivot.x + dx * cos - dy * sin,
            y: lidPivot.y + dx * sin + dy * cos
        };
    }

    // Set view mode and update display
    setViewMode(mode) {
        this.viewMode = mode;
        this.animating = (mode === 'animated');
        
        if (this.animating) {
            this.animationStartTime = null;
            requestAnimationFrame(this.animate.bind(this));
        } else {
            // Stop any ongoing animation
            this.stop();
            // Draw static position
            const position = (mode === 'open') ? 100 : 0;
            this.draw(this.ctx, position);
        }
    }

    // Animation loop
    animate(timestamp) {
        if (!this.animationStartTime) this.animationStartTime = timestamp;
        const elapsed = timestamp - this.animationStartTime;
        
        // Calculate position (0-100) based on time
        // Use sine wave to smoothly oscillate between 0 and 100
        const position = 50 - 50 * Math.cos(2 * Math.PI * elapsed / this.animationDuration);
        
        // Draw current frame
        this.draw(this.ctx, position);
        
        // Continue animation loop
        if (this.animating) {
            requestAnimationFrame(this.animate.bind(this));
        }
    }

    // Start animation
    start(ctx) {
        this.ctx = ctx;
        // Only start animating if in animated mode
        if (this.viewMode === 'animated') {
            this.animating = true;
            this.animationStartTime = null;
            requestAnimationFrame(this.animate.bind(this));
        } else {
            // Draw static position based on mode
            const position = (this.viewMode === 'open') ? 100 : 0;
            this.draw(ctx, position);
        }
    }

    // Stop animation
    stop() {
        this.animating = false;
    }

    // Draw current state of mechanism
    draw(ctx, position) {
        console.log('Drawing at position:', position);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        
        // Move to offset and flip y-axis (make positive y go up)
        ctx.translate(this.offset.x, this.offset.y);
        ctx.scale(this.scale, -this.scale);
        
        // Draw viewport bounds for debugging
        ctx.beginPath();
        ctx.rect(
            this.viewportBounds.left,
            this.viewportBounds.bottom,
            this.viewportBounds.right - this.viewportBounds.left,
            this.viewportBounds.top - this.viewportBounds.bottom
        );
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
        ctx.stroke();
        
        // Set line width relative to scale
        ctx.lineWidth = 1 / this.scale;
        
        // Draw box with cut shape when open
        ctx.beginPath();
        const alphaRad = this.alpha * Math.PI / 180;
        const criticalAngle = Math.atan2(this.h, this.d) * 180 / Math.PI;
        
        if (position === 100) {  // Open position - show cut
            if (this.alpha <= criticalAngle) {
                // Triangle cut
                ctx.moveTo(0, 0);  // Start at bottom-left
                ctx.lineTo(this.w, 0);  // Bottom edge
                ctx.lineTo(this.w, this.h);  // Right edge
                ctx.lineTo(this.d, this.h);  // Top edge until cut
                ctx.lineTo(0, this.h - this.d * Math.tan(alphaRad));  // Cut line to left edge
                ctx.closePath();
            } else {
                // Quadrilateral cut
                ctx.moveTo(this.d - this.h / Math.tan(alphaRad), 0);  // Start at cut point
                ctx.lineTo(this.w, 0);  // Bottom edge
                ctx.lineTo(this.w, this.h);  // Right edge
                ctx.lineTo(this.d, this.h);  // Top edge until cut
                ctx.closePath();
            }
        } else {  // Closed position - show full box
            ctx.rect(0, 0, this.w, this.h);
        }
        ctx.strokeStyle = 'black';
        ctx.stroke();
        
        // Get lid vertices for current position
        const vertices = this.getLidVertices(position);
        console.log('Lid vertices:', vertices);
        
        // Draw lid
        ctx.beginPath();
        ctx.moveTo(vertices.A.x, vertices.A.y);
        ctx.lineTo(vertices.B.x, vertices.B.y);
        ctx.lineTo(vertices.C.x, vertices.C.y);
        if (vertices.D) {
            ctx.lineTo(vertices.D.x, vertices.D.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'blue';
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(this.pivots.rod1.box.x, this.pivots.rod1.box.y);
        ctx.lineTo(this.pivots.rod1.lid.x, this.pivots.rod1.lid.y);
        ctx.moveTo(this.pivots.rod2.box.x, this.pivots.rod2.box.y);
        ctx.lineTo(this.pivots.rod2.lid.x, this.pivots.rod2.lid.y);
        ctx.strokeStyle = 'red';
        ctx.stroke();
        
        // Draw pivot points
        const drawPivot = (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, 0.1, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
        };
        
        drawPivot(this.pivots.rod1.box.x, this.pivots.rod1.box.y);
        drawPivot(this.pivots.rod1.lid.x, this.pivots.rod1.lid.y);
        drawPivot(this.pivots.rod2.box.x, this.pivots.rod2.box.y);
        drawPivot(this.pivots.rod2.lid.x, this.pivots.rod2.lid.y);
        
        ctx.restore();
    }
}

// Store current parameter values
let currentParams = {
    height: 100,
    width: 150,
    depth: 50,
    alpha: 45,
    gap: 10
};

// Create mechanism with initial parameters
let mechanism = new HingeMechanism(
    currentParams.height,
    currentParams.width,
    currentParams.depth,
    currentParams.alpha,
    currentParams.gap
);

// Setup canvas and controls
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    
    // Update mechanism with current parameters and redraw
    function updateMechanism() {
        const currentViewMode = mechanism.viewMode;  // Store current view mode
        mechanism = new HingeMechanism(
            currentParams.height,
            currentParams.width,
            currentParams.depth,
            currentParams.alpha,
            currentParams.gap
        );
        mechanism.viewMode = currentViewMode;  // Restore view mode
        draw();  // Immediate redraw
    }
    
    // Draw function
    function draw() {
        const position = mechanism.viewMode === 'open' ? 100 : 0;
        mechanism.draw(ctx, position);
    }
    
    // Handle slider changes - update immediately
    function setupSlider(id, key) {
        const slider = document.getElementById(id);
        const value = document.getElementById(id + 'Value');
        slider.value = currentParams[key];
        value.textContent = currentParams[key];
        
        slider.addEventListener('input', () => {
            currentParams[key] = parseInt(slider.value);
            value.textContent = slider.value;
            updateMechanism();  // Update and redraw immediately
        });
    }
    
    // Setup all sliders
    setupSlider('height', 'height');
    setupSlider('width', 'width');
    setupSlider('depth', 'depth');
    setupSlider('alpha', 'alpha');
    setupSlider('gap', 'gap');
    
    // Handle view mode changes
    const viewModeInputs = document.querySelectorAll('input[name="viewMode"]');
    viewModeInputs.forEach(input => {
        input.addEventListener('change', () => {
            mechanism.viewMode = input.value;
            draw();  // Immediate redraw
        });
    });
    
    // Initial draw
    draw();
});
