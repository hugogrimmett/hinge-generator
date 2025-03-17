class FourBarSolver {
    constructor(h, w, d, alpha, g, preferEqualLengths = false) {
        this.h = h;          // height
        this.w = w;          // width
        this.d = d;          // depth
        this.alpha = alpha;  // angle in degrees
        this.g = g;         // gap
        this.preferEqualLengths = preferEqualLengths;
        
        // Convert alpha to radians for calculations
        this.alphaRad = alpha * Math.PI / 180;
        this.criticalAngle = Math.atan(h/d);  // in radians
    }

    // Get lid vertices for any position (0 = closed, 100 = open)
    getLidVertices(position) {
        // Interpolate between closed and open positions
        const t = position / 100;
        
        // Calculate closed position vertices
        const closedVertices = this.alphaRad <= this.criticalAngle ? 
            // Triangle case
            [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // C
            ] :
            // Quadrilateral case
            [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // C
                {x: 0, y: 0}                                 // D
            ];

        // Calculate open position vertices
        const openVertices = this.alphaRad <= this.criticalAngle ?
            // Triangle case
            [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g, y: 2 * this.h - this.d * Math.tan(this.alphaRad)} // C'
            ] :
            // Quadrilateral case
            [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g - this.d + this.h / Math.tan(this.alphaRad), y: 2 * this.h}, // C'
                {x: this.w - this.g, y: 2 * this.h}                  // D'
            ];

        // Interpolate between closed and open vertices
        return closedVertices.map((v, i) => ({
            x: v.x + t * (openVertices[i].x - v.x),
            y: v.y + t * (openVertices[i].y - v.y)
        }));
    }

    // Calculate position of lid pivots given box pivots and rod lengths
    calculateLidPivots(boxPivot1, boxPivot2, rod1Length, rod2Length, theta1) {
        // theta1 is angle of first rod relative to horizontal
        const x1 = boxPivot1.x + rod1Length * Math.cos(theta1);
        const y1 = boxPivot1.y + rod1Length * Math.sin(theta1);
        
        // Find second pivot using circle intersection
        const circle1 = {x: x1, y: y1, r: this.d};  // Distance between lid pivots
        const circle2 = {x: boxPivot2.x, y: boxPivot2.y, r: rod2Length};
        
        // Get intersection points
        const intersections = this.circleIntersection(circle1, circle2);
        if (!intersections) return null;  // No valid configuration
        
        // Choose the intersection that gives valid lid position
        for (const p2 of intersections) {
            // Check if this configuration gives valid lid orientation
            const angle = Math.atan2(p2.y - y1, p2.x - x1);
            if (this.isValidLidOrientation({p1: {x: x1, y: y1}, p2: p2}, angle)) {
                return {
                    p1: {x: x1, y: y1},
                    p2: p2
                };
            }
        }
        
        return null;  // No valid configuration found
    }

    // Check if lid orientation is valid (no intersection with box)
    isValidLidOrientation(lidPivots, theta1) {
        // Get current lid vertices based on pivot positions
        const lidVertices = this.getLidVerticesFromPivots(lidPivots.p1, lidPivots.p2);
        
        // Get box vertices based on current state
        const boxVertices = this.getBoxVertices();
        
        // Check each lid edge against each box edge for intersection
        const lidEdges = this.getEdges(lidVertices);
        const boxEdges = this.getEdges(boxVertices);
        
        for (const lidEdge of lidEdges) {
            for (const boxEdge of boxEdges) {
                if (this.linesIntersect(lidEdge.start, lidEdge.end, boxEdge.start, boxEdge.end)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    // Get lid vertices given pivot points
    getLidVerticesFromPivots(p1, p2) {
        // Calculate lid orientation from pivot points
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const pivotDist = Math.sqrt(dx * dx + dy * dy);
        
        // Scale and rotate lid vertices based on pivot positions
        const baseVertices = this.alphaRad <= this.criticalAngle ?
            [
                {x: 0, y: 0},
                {x: this.d * Math.cos(this.alphaRad), y: this.d * Math.sin(this.alphaRad)},
                {x: 0, y: -this.d * Math.tan(this.alphaRad)}
            ] :
            [
                {x: 0, y: 0},
                {x: this.d, y: 0},
                {x: this.d - this.h / Math.tan(this.alphaRad), y: -this.h},
                {x: 0, y: -this.h}
            ];
            
        return baseVertices.map(v => ({
            x: p1.x + v.x * Math.cos(angle) - v.y * Math.sin(angle),
            y: p1.y + v.x * Math.sin(angle) + v.y * Math.cos(angle)
        }));
    }

    // Get current box vertices
    getBoxVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: 0, y: 0},                                // (0,0)
                {x: this.w, y: 0},                          // (w,0)
                {x: this.w, y: this.h},                     // (w,h)
                {x: this.d, y: this.h},                     // (d,h)
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // (0,h-d*tan(alpha))
            ];
        } else {
            return [
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // (d-h/tan(alpha),0)
                {x: this.w, y: 0},                          // (w,0)
                {x: this.w, y: this.h},                     // (w,h)
                {x: this.d, y: this.h}                      // (d,h)
            ];
        }
    }

    // Get edges from vertices
    getEdges(vertices) {
        const edges = [];
        for (let i = 0; i < vertices.length; i++) {
            edges.push({
                start: vertices[i],
                end: vertices[(i + 1) % vertices.length]
            });
        }
        return edges;
    }

    // Check if two line segments intersect
    linesIntersect(p1, p2, p3, p4) {
        const ccw = (A, B, C) => {
            return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        };
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    // Helper: Find intersection points of two circles
    circleIntersection(c1, c2) {
        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        // Check if circles are too far apart or too close together
        if (d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return null;
        
        const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
        const h = Math.sqrt(c1.r * c1.r - a * a);
        
        const x2 = c1.x + (dx * a) / d;
        const y2 = c1.y + (dy * a) / d;
        
        const rx = -dy * (h / d);
        const ry = dx * (h / d);
        
        return [
            {x: x2 + rx, y: y2 + ry},
            {x: x2 - rx, y: y2 - ry}
        ];
    }

    // Objective function for optimization
    objective(params) {
        const [x1, y1, x2, y2, rod1Length, rod2Length] = params;
        const boxPivot1 = {x: x1, y: y1};
        const boxPivot2 = {x: x2, y: y2};
        
        // Check rod lengths
        if (rod1Length <= 0 || rod2Length <= 0) {
            return 1e6;  // Large penalty for invalid rod lengths
        }
        
        // Penalty for pivots too far from box
        const maxDistance = Math.max(this.w, this.h) * 2;
        const pivot1Dist = Math.sqrt(x1 * x1 + y1 * y1);
        const pivot2Dist = Math.sqrt(x2 * x2 + y2 * y2);
        const distancePenalty = Math.max(0, pivot1Dist - maxDistance) + Math.max(0, pivot2Dist - maxDistance);
        
        // Test key positions
        let totalError = 0;
        const positions = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI];  // Test more positions
        
        for (const theta of positions) {
            const lidPivots = this.calculateLidPivots(
                boxPivot1, boxPivot2, rod1Length, rod2Length, theta
            );
            
            if (!lidPivots) {
                return 1e6;  // Position unreachable
            }
            
            // Check lid-box intersection
            if (!this.isValidLidOrientation(lidPivots, theta)) {
                return 1e6;  // Lid intersects box
            }
            
            // Add position error
            totalError += this.checkPositionError(lidPivots, theta);
        }
        
        // Penalty for unequal rod lengths if preferred
        let rodLengthPenalty = 0;
        if (this.preferEqualLengths) {
            rodLengthPenalty = Math.abs(rod1Length - rod2Length) * 0.1;
        }
        
        return totalError + distancePenalty * 10 + rodLengthPenalty;
    }

    // Nelder-Mead Simplex optimization
    optimize(initialParams) {
        // Adaptive parameters based on dimension
        const n = initialParams.length;
        const alpha = 1.0;  // reflection coefficient
        const gamma = 1.0 + 2.0/n;  // expansion coefficient
        const rho = 0.75 - 0.5/n;   // contraction coefficient
        const sigma = 1.0 - 1.0/n;  // shrink coefficient
        
        // Function to create initial simplex with improved spread
        const createSimplex = (center, scale = 1.0) => {
            let simplex = [center];
            for (let i = 0; i < n; i++) {
                let point = [...center];
                // Scale perturbation based on parameter magnitude
                const perturbation = Math.max(0.1, Math.abs(center[i] * 0.05)) * scale;
                point[i] += perturbation;
                simplex.push(point);
            }
            return simplex;
        };
        
        // Multiple restarts with different initial simplexes
        const maxRestarts = 3;
        let bestSolution = null;
        let bestValue = Infinity;
        
        for (let restart = 0; restart < maxRestarts; restart++) {
            // Create initial simplex with different scales
            const scale = 1.0 + restart * 0.5;  // Increase spread with each restart
            let simplex = createSimplex(initialParams, scale);
            let iterations = 0;
            let noImprovementCount = 0;
            let prevBest = Infinity;
            
            const maxIterations = 1000;
            const tolerance = 1e-6;
            
            while (iterations < maxIterations) {
                // Evaluate all points
                let values = simplex.map(p => this.objective(p));
                
                // Order points by objective value
                let order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
                simplex = order.map(i => simplex[i]);
                values = order.map(i => values[i]);
                
                // Update best solution if improved
                if (values[0] < bestValue) {
                    bestValue = values[0];
                    bestSolution = [...simplex[0]];
                }
                
                // Check convergence
                const range = values[n] - values[0];
                if (range < tolerance) {
                    break;
                }
                
                // Check for stagnation
                if (Math.abs(values[0] - prevBest) < tolerance) {
                    noImprovementCount++;
                    if (noImprovementCount > 10) {
                        // Random perturbation to escape local minimum
                        simplex = createSimplex(simplex[0], 0.1);
                        noImprovementCount = 0;
                    }
                } else {
                    noImprovementCount = 0;
                }
                prevBest = values[0];
                
                // Calculate centroid of all points except worst
                let centroid = new Array(n).fill(0);
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < n; j++) {
                        centroid[j] += simplex[i][j] / n;
                    }
                }
                
                // Reflection
                let reflected = centroid.map((c, i) => 
                    c + alpha * (c - simplex[n][i])
                );
                let reflectedValue = this.objective(reflected);
                
                if (reflectedValue < values[0]) {
                    // Expansion
                    let expanded = centroid.map((c, i) =>
                        c + gamma * (reflected[i] - c)
                    );
                    let expandedValue = this.objective(expanded);
                    
                    if (expandedValue < reflectedValue) {
                        simplex[n] = expanded;
                    } else {
                        simplex[n] = reflected;
                    }
                }
                else if (reflectedValue < values[n-1]) {
                    simplex[n] = reflected;
                }
                else {
                    // Contraction
                    let contracted = centroid.map((c, i) =>
                        c + rho * (simplex[n][i] - c)
                    );
                    let contractedValue = this.objective(contracted);
                    
                    if (contractedValue < values[n]) {
                        simplex[n] = contracted;
                    }
                    else {
                        // Shrink towards best point
                        for (let i = 1; i <= n; i++) {
                            simplex[i] = simplex[i].map((x, j) =>
                                simplex[0][j] + sigma * (x - simplex[0][j])
                            );
                        }
                    }
                }
                
                iterations++;
            }
        }
        
        return bestSolution;
    }

    // Validate that a solution works for both closed and open positions
    validateSolution(solution) {
        const [x1, y1, x2, y2, rod1Length, rod2Length] = solution;
        const boxPivot1 = {x: x1, y: y1};
        const boxPivot2 = {x: x2, y: y2};
        
        // Basic parameter validation
        if (!solution || solution.length !== 6) {
            return {
                isValid: false,
                error: "Invalid solution format",
                details: {
                    expectedLength: 6,
                    actualLength: solution ? solution.length : 0
                }
            };
        }
        
        // Check for NaN or infinite values
        if (solution.some(v => isNaN(v) || !isFinite(v))) {
            return {
                isValid: false,
                error: "Solution contains invalid numbers",
                details: {
                    hasNaN: solution.some(v => isNaN(v)),
                    hasInfinite: solution.some(v => !isFinite(v))
                }
            };
        }
        
        // Validate rod lengths
        const minRodLength = Math.max(this.d * 0.25, 10);  // Minimum length based on depth or absolute minimum
        const maxRodLength = Math.sqrt(4 * this.w * this.w + 4 * this.h * this.h);  // Allow for larger max length
        if (rod1Length < minRodLength || rod2Length < minRodLength ||
            rod1Length > maxRodLength || rod2Length > maxRodLength) {
            return {
                isValid: false,
                error: "Rod lengths out of valid range",
                details: {
                    rod1Length,
                    rod2Length,
                    minAllowed: minRodLength,
                    maxAllowed: maxRodLength
                }
            };
        }
        
        // Check key positions (closed, middle, open)
        const positions = [0, Math.PI/2, Math.PI];  // 0°, 90°, 180°
        const errors = [];
        let maxError = 0;
        
        for (const theta of positions) {
            const lidPivots = this.calculateLidPivots(
                boxPivot1, boxPivot2, rod1Length, rod2Length, theta
            );
            
            if (!lidPivots) {
                return {
                    isValid: false,
                    error: `Cannot reach ${theta === 0 ? 'closed' : theta === Math.PI ? 'open' : 'middle'} position`,
                    details: {
                        theta: theta * 180 / Math.PI,
                        boxPivot1,
                        boxPivot2,
                        rod1Length,
                        rod2Length
                    }
                };
            }
            
            // Check lid-box intersection
            if (!this.isValidLidOrientation(lidPivots, theta)) {
                return {
                    isValid: false,
                    error: `Lid intersects with box at ${theta === 0 ? 'closed' : theta === Math.PI ? 'open' : 'middle'} position`,
                    details: {
                        theta: theta * 180 / Math.PI,
                        lidPivots
                    }
                };
            }
            
            // Calculate position error
            const error = this.checkPositionError(lidPivots, theta);
            errors.push(error);
            maxError = Math.max(maxError, error);
        }
        
        // Check if errors are within acceptable range
        const maxAllowedError = 1.0;
        if (maxError > maxAllowedError) {
            return {
                isValid: false,
                error: "Position errors too large",
                details: {
                    closedError: errors[0],
                    middleError: errors[1],
                    openError: errors[2],
                    maxAllowedError
                }
            };
        }
        
        // All checks passed
        return {
            isValid: true,
            details: {
                closedError: errors[0],
                middleError: errors[1],
                openError: errors[2],
                rod1Length,
                rod2Length,
                boxPivot1,
                boxPivot2
            }
        };
    }

    // Check how well lid pivots match required position
    checkPositionError(lidPivots, theta) {
        const vertices = this.getLidVerticesFromPivots(lidPivots.p1, lidPivots.p2);
        const requiredVertices = theta === 0 ? 
            this.getClosedLidVertices() : 
            this.getOpenLidVertices();
            
        // Calculate max distance between corresponding vertices
        let maxError = 0;
        for (let i = 0; i < vertices.length; i++) {
            const dx = vertices[i].x - requiredVertices[i].x;
            const dy = vertices[i].y - requiredVertices[i].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            maxError = Math.max(maxError, distance);
        }
        return maxError;
    }
    
    // Get required lid vertices in closed position
    getClosedLidVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: 0, y: this.h - this.d * Math.tan(this.alphaRad)} // C
            ];
        } else {
            return [
                {x: 0, y: this.h},                           // A
                {x: this.d, y: this.h},                      // B
                {x: this.d - this.h / Math.tan(this.alphaRad), y: 0}, // C
                {x: 0, y: 0}                                 // D
            ];
        }
    }
    
    // Get required lid vertices in open position
    getOpenLidVertices() {
        if (this.alphaRad <= this.criticalAngle) {
            return [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g, y: 2 * this.h - this.d * Math.tan(this.alphaRad)} // C'
            ];
        } else {
            return [
                {x: this.w - this.g, y: this.h},                      // A'
                {x: this.w - this.g - this.d, y: this.h},            // B'
                {x: this.w - this.g - this.d + this.h / Math.tan(this.alphaRad), y: 2 * this.h}, // C'
                {x: this.w - this.g, y: 2 * this.h}                  // D'
            ];
        }
    }

    // Main solve method
    solve() {
        // Calculate reasonable initial parameters based on box geometry
        const initialParams = (() => {
            // Start with pivots near the corners of the box
            const x1 = -this.d * 0.2;  // Left pivot slightly outside box
            const y1 = this.h * 0.8;   // Near top of box
            const x2 = this.d * 1.2;   // Right pivot slightly outside box
            const y2 = this.h * 0.8;   // Near top of box
            
            // Calculate initial rod lengths based on lid geometry
            const closedLidVertices = this.getClosedLidVertices();
            const openLidVertices = this.getOpenLidVertices();
            
            // Use distance between pivots and lid corners as initial rod lengths
            const dx1 = closedLidVertices[0].x - x1;
            const dy1 = closedLidVertices[0].y - y1;
            const dx2 = closedLidVertices[1].x - x2;
            const dy2 = closedLidVertices[1].y - y2;
            
            const rod1Length = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            const rod2Length = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            
            return [x1, y1, x2, y2, rod1Length, rod2Length];
        })();
        
        // Run optimization
        const solution = this.optimize(initialParams);
        
        // Validate solution
        const validation = this.validateSolution(solution);
        
        // Add more details to the validation result
        if (!validation.isValid && validation.error === "Cannot reach closed position") {
            validation.details = {
                ...validation.details,
                criticalAngle: (this.criticalAngle * 180 / Math.PI).toFixed(2) + "°",
                currentCase: this.alphaRad <= this.criticalAngle ? "Triangle" : "Quadrilateral",
                initialParams: {
                    boxPivot1: {x: initialParams[0], y: initialParams[1]},
                    boxPivot2: {x: initialParams[2], y: initialParams[3]},
                    rod1Length: initialParams[4],
                    rod2Length: initialParams[5]
                },
                suggestions: [
                    "Try increasing the rod lengths",
                    "Try moving pivot points closer to the lid",
                    "Try adjusting the alpha angle"
                ]
            };
        }
        
        // Return results
        return {
            boxPivot1: {x: solution[0], y: solution[1]},
            boxPivot2: {x: solution[2], y: solution[3]},
            rod1Length: solution[4],
            rod2Length: solution[5],
            isValid: validation.isValid,
            error: validation.error,
            details: validation.details
        };
    }
}
