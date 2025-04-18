// STL Generator for Hinge Box using JSCAD
class STLGenerator {
    constructor(boxGeometry, units = 'cm', advancedSettings = {}) {
        // Get JSCAD modules from the global jscadModeling object
        this.modeling = jscadModeling;
        
        // Store geometry and apply scaling to the geometry dimensions
        this.units = units;
        this.scaleFactor = this.getScaleFactor(units);
        
        // Create a scaled copy of the geometry
        this.geometry = this.createScaledGeometry(boxGeometry);
        
        // All dimensions in mm - these are fixed regardless of units
        // Part thicknesses
        this.boxThickness = advancedSettings.boxThickness || 3;     // Box thickness
        this.lidThickness = this.boxThickness;     // Lid thickness is same as box thickness
        this.linkThickness = advancedSettings.linkThickness || 2;  // Link thickness

        this.boxWidth = advancedSettings.boxWidth;  // the width of the 3D box

        // Link dimensions
        this.linkWidth = advancedSettings.linkWidth || 3.5;        // Width of link arms
        
        // Pin and hole dimensions
        this.shortPinDiameter = advancedSettings.pivotAxleDiameter || 4;   // Short pin diameter
        this.axleTolerance = advancedSettings.axleTolerance || 0.2;  // Tolerance for rotational joint (diameter)
        this.holeDiameter = this.shortPinDiameter + this.axleTolerance;   // Diameter of holes in links
        
        // Calculate minimum rim diameter
        const minRimDiameter = this.shortPinDiameter + this.axleTolerance + 0.5;
        this.rimDiameter = Math.max(minRimDiameter, advancedSettings.rimDiameter || 9);  // Diameter of rims around holes
        
        this.textDepth = 1;        // Depth of text engraving
        this.textHeight = this.linkWidth * 0.8; // Height of text (80% of link width)
        
        // Pin dimensions derived from other settings
        this.shortPinHeight = 0.2 + this.linkThickness;     // Short pin height
        this.pinRidgeDiameter = this.holeDiameter;
        this.pinRidgeHeight = 0.5;
        
        this.tallPinBaseDiameter = 1 + this.shortPinDiameter;  // Tall pin base diameter
        this.tallPinBaseHeight = 0.5 + this.pinRidgeHeight + this.shortPinHeight;  // Tall pin base height
        this.tallPinTopDiameter = this.shortPinDiameter;   // Tall pin top diameter
        this.tallPinTopHeight = this.shortPinHeight;     // Tall pin top height
        
        // Connecting arm dimensions
        this.armWidth =  this.shortPinDiameter;         // Width of connecting arms
        this.armExtension = this.armWidth;     // Extra length to ensure arms reach into box
    }
    
    // Helper to get scale factor based on units
    getScaleFactor(units) {
        switch(units) {
            case 'mm':
                return 1;     // 1 unit = 1mm (no scaling needed)
            case 'cm':
                return 10;    // 1 unit = 1cm = 10mm
            case 'in':
                return 25.4;  // 1 unit = 1in = 25.4mm
            default:
                return 10;    // Default to cm
        }
    }
    
    // Create a scaled copy of the geometry
    createScaledGeometry(originalGeometry) {
        // Create a deep copy of the geometry with scaled dimensions
        const scaledGeometry = {
            // Scale the box dimensions
            height: originalGeometry.height * this.scaleFactor,
            width: originalGeometry.width * this.scaleFactor,
            depth: originalGeometry.depth * this.scaleFactor,
            gap: originalGeometry.gap * this.scaleFactor,
            
            // Copy angle properties (these don't need scaling as they're in radians)
            closedAngle: originalGeometry.closedAngle,
            openAngle: originalGeometry.openAngle,
            
            // Scale the pivot points
            redBoxPoint: this.scalePoint(originalGeometry.redBoxPoint),
            blueBoxPoint: this.scalePoint(originalGeometry.blueBoxPoint),
            redClosedPoint: this.scalePoint(originalGeometry.redClosedPoint),
            blueClosedPoint: this.scalePoint(originalGeometry.blueClosedPoint),
            redOpenPoint: this.scalePoint(originalGeometry.redOpenPoint),
            blueOpenPoint: this.scalePoint(originalGeometry.blueOpenPoint),
            
            // Copy methods that we need
            getBoxVertices: () => this.scaleVertices(originalGeometry.getBoxVertices()),
            getClosedLidVertices: () => this.scaleVertices(originalGeometry.getClosedLidVertices()),
            getOpenLidVertices: () => this.scaleVertices(originalGeometry.getOpenLidVertices()),
            getCenterOfRotation: () => this.scalePoint(originalGeometry.getCenterOfRotation())
        };
        
        return scaledGeometry;
    }
    
    // Helper to scale a point
    scalePoint(point) {
        if (!point) return null;
        return {
            x: point.x * this.scaleFactor,
            y: point.y * this.scaleFactor
        };
    }
    
    // Helper to scale an array of vertices
    scaleVertices(vertices) {
        if (!vertices) return [];
        return vertices.map(vertex => this.scalePoint(vertex));
    }

    async generateZip() {
        try {
            const zip = new JSZip();
            
            // Generate all STLs
            const box2DResult = await this.generate2DBoxSTL();
            const lid2DResult = await this.generate2DLidSTL();
            const linkTopStl = await this.generateLinkSTL("UPPER", true);
            const linkBottomStl = await this.generateLinkSTL("LOWER", false);
            
            // Generate 3D box and lid STLs
            const box3DResult = await this.generate3DBoxSTL();
            const lid3DResult = await this.generate3DLidSTL();
            
            // Create 2D and 3D folders
            const folder2D = zip.folder("2D-model");
            const folder3D = zip.folder("3D-model");
            
            // Add to zip - extract the STL blobs from the returned objects
            folder2D.file("box2D.stl", box2DResult.stl);
            folder2D.file("lid2D.stl", lid2DResult.stl);
            folder2D.file("linkTop.stl", linkTopStl.stl);
            folder2D.file("linkBottom.stl", linkBottomStl.stl);
            folder3D.file("box3D.stl", box3DResult.stl);
            folder3D.file("lid3D.stl", lid3DResult.stl);
            folder3D.file("linkTop1.stl", linkTopStl.stl);
            folder3D.file("linkTop2.stl", linkTopStl.stl);
            folder3D.file("linkBottom1.stl", linkBottomStl.stl);
            folder3D.file("linkBottom2.stl", linkBottomStl.stl);
            
            // Generate info text file
            const infoText = this.generateInfoText();
            zip.file("hinge-info.txt", infoText);
            
            // Generate and return zip
            const content = await zip.generateAsync({type: "blob"});
            return content;
        } catch (error) {
            console.error("Error in generateZip:", error);
            throw error;
        }
    }

    async generate2DBoxSTL() {
        try {
            const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
            
            // Get box vertices and create 2D shape
            const vertices = this.geometry.getBoxVertices();
            const points = vertices.map(v => [v.x, v.y]);
            const polygon = geometries.geom2.fromPoints(points);
            
            // Extrude to thickness
            let box = extrusions.extrudeLinear({height: this.boxThickness}, polygon);
            
            // Add pins and connecting arms where needed
            const center = this.geometry.getCenterOfRotation();
            
            // Get red and blue box points
            const redBoxPoint = this.geometry.redBoxPoint;
            const blueBoxPoint = this.geometry.blueBoxPoint;
            
            // Determine which point is on top (higher Y value)
            const isRedOnTop = redBoxPoint.y > blueBoxPoint.y;
            const topBoxPoint = isRedOnTop ? redBoxPoint : blueBoxPoint;
            const bottomBoxPoint = isRedOnTop ? blueBoxPoint : redBoxPoint;
            
            // Create top pin (short single cylinder)
            const topPinAxle = primitives.cylinder({
                height: this.shortPinHeight,
                radius: this.shortPinDiameter / 2,
                center: [topBoxPoint.x, topBoxPoint.y, this.boxThickness + this.shortPinHeight / 2]
            });

            // Create pin ridge (short pin)
            const topPinRidge = primitives.cylinder({
                height: this.pinRidgeHeight,
                radius: this.pinRidgeDiameter / 2,
                center: [topBoxPoint.x, topBoxPoint.y, this.boxThickness + this.shortPinHeight + this.pinRidgeHeight / 2]
            });

            const topPin = booleans.union(topPinAxle, topPinRidge);
            
            // Create bottom pin (tall two-part cylinder)
            // Base cylinder for bottom pin
            const bottomBasePin = primitives.cylinder({
                height: this.tallPinBaseHeight,
                radius: this.tallPinBaseDiameter / 2,
                center: [bottomBoxPoint.x, bottomBoxPoint.y, this.boxThickness + this.tallPinBaseHeight / 2]
            });
            
            // Top cylinder for bottom pin
            const bottomTopPin = primitives.cylinder({
                height: this.tallPinTopHeight,
                radius: this.tallPinTopDiameter / 2,
                center: [
                    bottomBoxPoint.x, 
                    bottomBoxPoint.y, 
                    this.boxThickness + this.tallPinBaseHeight + this.tallPinTopHeight / 2
                ]
            });

            // Create pin ridge (tall pin)
            const bottomPinRidge = primitives.cylinder({
                height: this.pinRidgeHeight,
                radius: this.pinRidgeDiameter / 2,
                center: [
                    bottomBoxPoint.x, 
                    bottomBoxPoint.y, 
                    this.boxThickness + this.tallPinBaseHeight + this.tallPinTopHeight + this.pinRidgeHeight / 2
                ]
            });
            
            // Combine the bottom pin parts
            const bottomPin = booleans.union(bottomBasePin, bottomTopPin, bottomPinRidge);
            
            // Check if red point is outside box and add connecting arm if needed
            if (!this.isPointInPolygon(redBoxPoint, vertices)) {
                const redArm = this.createConnectingArm(center, redBoxPoint);
                box = booleans.union(box, redArm);
            }
            
            // Check if blue point is outside box and add connecting arm if needed
            if (!this.isPointInPolygon(blueBoxPoint, vertices)) {
                const blueArm = this.createConnectingArm(center, blueBoxPoint);
                box = booleans.union(box, blueArm);
            }
            
            // Add pins to box
            box = booleans.union(box, topPin, bottomPin);
            
            // Convert to STL binary data
            const stlData = this.serializeToStl(box);
            if (!stlData || stlData.length === 0) {
                throw new Error("Failed to generate STL data for 2D box");
            }
            
            return { 
                stl: new Blob([stlData], {type: 'model/stl'}),
                geometry: box
            };
        } catch (error) {
            console.error("Error in generate2DBoxSTL:", error);
            throw error;
        }
    }

    createConnectingArm(from, to) {
        const { primitives, transforms, extrusions } = this.modeling;
        
        // Calculate direction vector
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Create rectangle for arm - extend by armExtension to ensure it reaches into box
        const rect = primitives.rectangle({
            size: [length + this.armExtension, this.armWidth],
            center: [length / 2, 0]
        });
        
        // Extrude and rotate to correct position
        let arm = extrusions.extrudeLinear({height: this.boxThickness}, rect);
        arm = transforms.rotateZ(angle, arm);
        arm = transforms.translate([from.x, from.y, 0], arm);
        
        return arm;
    }

    isPointInPolygon(point, vertices) {
        // Simple point-in-polygon test
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            
            const intersect = ((yi > point.y) !== (yj > point.y))
                && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    async generate2DLidSTL() {
        try {
            const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
            
            // Get lid vertices and create 2D shape
            const vertices = this.geometry.getClosedLidVertices();
            
            // Reverse the vertex order to fix inverted normals
            const reversedVertices = [...vertices].reverse();
            const points = reversedVertices.map(v => [v.x, v.y]);
            
            // Create the 2D polygon and extrude
            const polygon = geometries.geom2.fromPoints(points);
            let lid = extrusions.extrudeLinear({height: this.lidThickness}, polygon);
            
            // Add pins and connecting arms where needed
            const center = this.geometry.getCenterOfRotation();
            
            // Get red and blue lid points
            const redLidPoint = this.geometry.redClosedPoint;
            const blueLidPoint = this.geometry.blueClosedPoint;
            
            // Determine which point is on top (higher Y value)
            const isRedOnTop = redLidPoint.y > blueLidPoint.y;
            const topLidPoint = isRedOnTop ? redLidPoint : blueLidPoint;
            const bottomLidPoint = isRedOnTop ? blueLidPoint : redLidPoint;
            
            // Create top pin (short single cylinder)
            const topPinAxle = primitives.cylinder({
                height: this.shortPinHeight,
                radius: this.shortPinDiameter / 2,
                segments: 32,
                center: [topLidPoint.x, topLidPoint.y, this.lidThickness + this.shortPinHeight / 2]
            });

            // Create top pin ridge
            const topPinRidge = primitives.cylinder({
                height: this.pinRidgeHeight,
                radius: this.pinRidgeDiameter / 2,
                segments: 32,
                center: [topLidPoint.x, topLidPoint.y, this.lidThickness + this.shortPinHeight + this.pinRidgeHeight / 2]
            });

            const topPin = booleans.union(topPinAxle, topPinRidge);
            
            // Create bottom pin (tall two-part cylinder)
            // Base cylinder for bottom pin
            const bottomBasePin = primitives.cylinder({
                height: this.tallPinBaseHeight,
                radius: this.tallPinBaseDiameter / 2,
                segments: 32,
                center: [bottomLidPoint.x, bottomLidPoint.y, this.lidThickness + this.tallPinBaseHeight / 2]
            });
            
            // Top cylinder for bottom pin
            const bottomTopPin = primitives.cylinder({
                height: this.tallPinTopHeight,
                radius: this.tallPinTopDiameter / 2,
                segments: 32,
                center: [
                    bottomLidPoint.x, 
                    bottomLidPoint.y, 
                    this.lidThickness + this.tallPinBaseHeight + this.tallPinTopHeight / 2
                ]
            });

            // Create bottom pin ridge
            const bottomPinRidge = primitives.cylinder({
                height: this.pinRidgeHeight,
                radius: this.pinRidgeDiameter / 2,
                segments: 32,
                center: [
                    bottomLidPoint.x, 
                    bottomLidPoint.y, 
                    this.lidThickness + this.tallPinBaseHeight + this.tallPinTopHeight + this.pinRidgeHeight / 2
                ]
            });
            
            // Combine the bottom pin parts
            const bottomPin = booleans.union(bottomBasePin, bottomTopPin, bottomPinRidge);
            
            // Add pins to lid
            lid = booleans.union(lid, topPin);
            lid = booleans.union(lid, bottomPin);
            
            // Convert to STL binary data
            const stlData = this.serializeToStl(lid);
            if (!stlData || stlData.length === 0) {
                throw new Error("Failed to generate STL data for 2D lid");
            }
            return { 
                stl: new Blob([stlData], {type: 'model/stl'}),
                geometry: lid
            };
        } catch (error) {
            console.error("Error in generate2DLidSTL:", error);
            throw error;
        }
    }

    async generateLinkSTL(labelText, isTop) {
        try {
            const { primitives, transforms, booleans, extrusions } = this.modeling;
            
            // Get points and calculate length and angle
            const boxPoint = isTop ? this.geometry.redBoxPoint : this.geometry.blueBoxPoint;
            const lidPoint = isTop ? this.geometry.redClosedPoint : this.geometry.blueClosedPoint;
            
            // Calculate length and angle
            const dx = lidPoint.x - boxPoint.x;
            const dy = lidPoint.y - boxPoint.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Create link body
            const rect = primitives.rectangle({
                size: [length, this.linkWidth],
                center: [length / 2, 0]
            });
            
            // Create solid rims for holes
            const boxRim = primitives.circle({
                radius: this.rimDiameter / 2,
                center: [0, 0]
            });
            
            const lidRim = primitives.circle({
                radius: this.rimDiameter / 2,
                center: [length, 0]
            });
            
            // Union the rims with the link body
            const linkWithRims = booleans.union(rect, boxRim, lidRim);
            
            // Create holes for pins
            const boxHole = primitives.circle({
                radius: this.holeDiameter / 2,
                center: [0, 0]
            });
            
            const lidHole = primitives.circle({
                radius: this.holeDiameter / 2,
                center: [length, 0]
            });
            
            // Subtract holes from link
            const linkWithHoles = booleans.subtract(linkWithRims, boxHole, lidHole);
            
            // Extrude to thickness
            let link = extrusions.extrudeLinear({height: this.linkThickness}, linkWithHoles);
            
            // Rotate and position link
            link = transforms.rotateZ(angle, link);
            link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
            
            // Convert to STL binary data
            const stlData = this.serializeToStl(link);
            if (!stlData || stlData.length === 0) {
                throw new Error("Failed to generate STL data for link");
            }
            
            return { 
                stl: new Blob([stlData], {type: 'model/stl'}),
                geometry: link
            };
        } catch (error) {
            console.error("Error in generateLinkSTL:", error);
            throw error;
        }
    }
    
    // Generate information text file
    generateInfoText() {
        // Get current URL
        const url = window.location.href;
        
        // Get current date and time with timezone
        const now = new Date();
        const dateStr = now.toISOString().replace('T', ' ').substring(0, 19) + " UTC";
        
        // Get geometry
        const geometry = this.geometry;
        
        // Calculate rod lengths
        const redRodLength = this.calculateDistance(
            geometry.redBoxPoint,
            geometry.redClosedPoint
        );
        
        const blueRodLength = this.calculateDistance(
            geometry.blueBoxPoint,
            geometry.blueClosedPoint
        );
        
        // Format text
        let text = "HINGE GENERATOR INFORMATION\n";
        text += "==========================\n\n";
        
        text += `Generated: ${dateStr}\n`;
        text += `URL: ${url}\n\n`;
        
        // Get units (default to mm if not available)
        const units = this.units || "mm";
        
        // Extract alpha angle from URL
        let alphaAngle = 0;
        try {
            // Get alpha from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            alphaAngle = parseFloat(urlParams.get('alpha') || 0);
            // Convert to degrees if it's in radians (typically less than 6.28)
            if (alphaAngle < 6.28) {
                alphaAngle = alphaAngle * 180 / Math.PI;
            }
        } catch (error) {
            console.warn("Could not parse alpha angle from URL", error);
            // Fallback to geometry object
            alphaAngle = geometry.closedAngle ? (geometry.closedAngle * 180 / Math.PI) : 0;
        }
        
        text += "BOX PARAMETERS\n";
        text += "--------------\n";
        text += `Height: ${geometry.height} ${units}\n`;
        text += `Width: ${geometry.width} ${units}\n`;
        text += `Depth: ${geometry.depth} ${units}\n`;
        const degreeSymbol = "\u00B0";
        text += `Alpha: ${this.formatNumber(alphaAngle)}${degreeSymbol}\n`;
        text += `Gap: ${geometry.gap} ${units}\n\n`;
        
        text += "PIVOT POINTS\n";
        text += "------------\n";
    
        // Create unscaled points
        const unscaledRedBoxPoint = this.unscalePoint(geometry.redBoxPoint);
        const unscaledBlueBoxPoint = this.unscalePoint(geometry.blueBoxPoint);
        const unscaledRedClosedPoint = this.unscalePoint(geometry.redClosedPoint);
        const unscaledBlueClosedPoint = this.unscalePoint(geometry.blueClosedPoint);
        
        text += `Real-world Coordinates (${units}):\n`;
        text += `Red Box Pivot: (${this.formatNumber(unscaledRedBoxPoint.x)}, ${this.formatNumber(unscaledRedBoxPoint.y)}) ${units}\n`;
        text += `Blue Box Pivot: (${this.formatNumber(unscaledBlueBoxPoint.x)}, ${this.formatNumber(unscaledBlueBoxPoint.y)}) ${units}\n`;
        text += `Red Closed Pivot: (${this.formatNumber(unscaledRedClosedPoint.x)}, ${this.formatNumber(unscaledRedClosedPoint.y)}) ${units}\n`;
        text += `Blue Closed Pivot: (${this.formatNumber(unscaledBlueClosedPoint.x)}, ${this.formatNumber(unscaledBlueClosedPoint.y)}) ${units}\n\n`;
    
        
        text += "ROD LENGTHS\n";
        text += "-----------\n";
        text += `Red Rod: ${this.formatNumber(redRodLength / this.scaleFactor)} ${units}\n`;
        text += `Blue Rod: ${this.formatNumber(blueRodLength / this.scaleFactor)} ${units}\n\n`;
        
        text += "MANUFACTURING NOTES\n";
        text += "------------------\n";
        text += `- STL files are scaled to ${units} units\n`;
        text += `- Pin diameters are fixed at ${this.shortPinDiameter}mm (short) and ${this.tallPinBaseDiameter}mm (tall base)\n`;
        text += `- Link thickness is ${this.linkThickness}mm\n`;
        text += `- Box and lid thickness is ${this.boxThickness}mm\n`;
        text += `- Hole diameter includes ${this.axleTolerance}mm tolerance for fit\n`;
        
        return text;
    }
    
    // Helper to calculate distance between two points
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 0;
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Helper to format a number to 3 decimal places
    formatNumber(num) {
        return Number(num).toFixed(3);
    }
    
    // Helper to unscale a point (if not already defined)
    unscalePoint(point) {
        if (!point) return null;
        return {
            x: point.x / (this.scaleFactor || 1),
            y: point.y / (this.scaleFactor || 1)
        };
    }
    
    // Custom STL serializer based on JSCAD's STL serializer
    serializeToStl(object) {
        const { geometries } = this.modeling;
        
        // first check if the host is little-endian:
        const buffer = new ArrayBuffer(4);
        const int32buffer = new Int32Array(buffer, 0, 1);
        const int8buffer = new Int8Array(buffer, 0, 4);
        int32buffer[0] = 0x11223344;
        if (int8buffer[0] !== 0x44) {
            throw new Error('Binary STL output is currently only supported on little-endian (Intel) processors');
        }
        
        // Get all polygons from the object
        const polygons = geometries.geom3.toPolygons(object);
        
        // Count triangles
        let numtriangles = 0;
        polygons.forEach((polygon) => {
            const numvertices = polygon.vertices.length;
            const thisnumtriangles = (numvertices >= 3) ? numvertices - 2 : 0;
            numtriangles += thisnumtriangles;
        });
        
        // Create header (80 bytes)
        const headerarray = new Uint8Array(80);
        for (let i = 0; i < 80; i++) {
            headerarray[i] = 65;
        }
        
        // Create triangle count (4 bytes)
        const ar1 = new Uint32Array(1);
        ar1[0] = numtriangles;
        
        // Create buffer for all triangles
        const allTrianglesBuffer = new ArrayBuffer(50 * numtriangles);
        const allTrianglesBufferAsInt8 = new Int8Array(allTrianglesBuffer);
        
        // Create temporary buffer for each triangle
        const triangleBuffer = new ArrayBuffer(50);
        const triangleBufferAsInt8 = new Int8Array(triangleBuffer);
        const triangleFloat32array = new Float32Array(triangleBuffer, 0, 12);
        const triangleUint16array = new Uint16Array(triangleBuffer, 48, 1);
        
        let byteoffset = 0;
        
        // Process all polygons and convert to triangles
        polygons.forEach((polygon) => {
            const vertices = polygon.vertices;
            const numvertices = vertices.length;
            const plane = geometries.poly3.plane(polygon);
            
            // Triangulate polygon
            for (let i = 0; i < numvertices - 2; i++) {
                // Normal vector
                triangleFloat32array[0] = plane[0];
                triangleFloat32array[1] = plane[1];
                triangleFloat32array[2] = plane[2];
                
                let arindex = 3;
                for (let v = 0; v < 3; v++) {
                    const vv = v + ((v > 0) ? i : 0);
                    const vertex = vertices[vv];
                    triangleFloat32array[arindex++] = vertex[0];
                    triangleFloat32array[arindex++] = vertex[1];
                    triangleFloat32array[arindex++] = vertex[2];
                }
                
                triangleUint16array[0] = 0;
                
                // Copy triangle to main buffer
                allTrianglesBufferAsInt8.set(triangleBufferAsInt8, byteoffset);
                byteoffset += 50;
            }
        });
        
        // Combine all buffers into one
        const headerBuffer = headerarray.buffer;
        const triangleCountBuffer = ar1.buffer;
        
        // Create a new buffer with all data
        const totalBytes = headerBuffer.byteLength + triangleCountBuffer.byteLength + allTrianglesBuffer.byteLength;
        const finalBuffer = new ArrayBuffer(totalBytes);
        const finalBufferView = new Uint8Array(finalBuffer);
        
        // Copy data into final buffer
        let offset = 0;
        finalBufferView.set(new Uint8Array(headerBuffer), offset);
        offset += headerBuffer.byteLength;
        finalBufferView.set(new Uint8Array(triangleCountBuffer), offset);
        offset += triangleCountBuffer.byteLength;
        finalBufferView.set(new Uint8Array(allTrianglesBuffer), offset);
        
        return finalBuffer;
    }

    async generate3DBoxSTL() {
        return this.generate3DSTL('box');
    }
    
    async generate3DLidSTL() {
        return this.generate3DSTL('lid');
    }
    
    async generate3DSTL(type) {
        try {
            const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
            
            // Get 3D vertices based on type
            const vertices = type === 'box' ? this.get3DBoxVertices() : this.get3DLidVertices();
            const points = vertices.map(v => [v.x, v.y]);
            const polygon = geometries.geom2.fromPoints(points);

            const thickness = type === 'box' ? this.boxThickness : this.lidThickness;
            
            // Step 2: Extrude the polygon to a depth of -this.boxWidth/2
            let geom3D = extrusions.extrudeLinear({height: -this.boxWidth/2 + thickness}, polygon);
            
            // Step 3: Form the union with the geometry result of generate2D STL
            const result2D = type === 'box' 
                ? await this.generate2DBoxSTL()
                : await this.generate2DLidSTL();
            
            // Extract the geometry from the result
            const geom2D = result2D.geometry;
            
            geom3D = booleans.union(geom3D, geom2D);

            // Step 4: Mirror in a plane parallel to XY plane but offset by -this.boxWidth/2
            // translate lid3D by -this.geometry.width/2 + this.lidThickness in the z direction
            geom3D = transforms.translate([0, 0, this.boxWidth/2 - thickness], geom3D)
            let mirroredGeom = transforms.mirrorZ(geom3D);
            
            // // Step 5: Form the union of these two shapes
            geom3D = booleans.union(geom3D, mirroredGeom);
            
            // Convert to STL binary data
            const stlData = this.serializeToStl(geom3D);
            if (!stlData || stlData.length === 0) {
                throw new Error("Failed to generate STL data for 3D " + type);
            }
            
            return { 
                stl: new Blob([stlData], {type: 'model/stl'}),
                geometry: geom3D
            };
        } catch (error) {
            console.error("Error in generate3DSTL:", error, "type:", type);
            throw error;
        }
    }
    
    // Function to get 3D box vertices
    get3DBoxVertices() {
        const height = this.geometry.height;
        const width = this.geometry.width;
        const depth = this.geometry.depth;
        const closedAngle = this.geometry.closedAngle;
        const thickness = this.boxThickness;
        const criticalAngle = Math.atan2(height, depth);        
        
        let vertices; 

        if (closedAngle <= criticalAngle) {
            //    depth
            // A -- B -------------------- F
            // |   /                       |
            // | /                         |  height
            // C                           |
            // |                           |
            // D ------------------------- E
            //             width
            vertices = [
                {x: 0, y: height - depth * Math.tan(closedAngle)},      // C
                {x: 0, y: 0},                                           // D
                {x: width, y: 0},                                       // E
                {x: width, y: height},                                  // F
                {x: depth, y: height},                                  // B
                {x: depth - thickness / Math.tan(closedAngle), y: height - thickness},  // B'
                {x: width-thickness, y: height-thickness},              // F'
                {x: width-thickness, y: thickness},                     // E'
                {x: thickness, y: thickness},                           // D' 
                {x: thickness, y: height - depth * Math.tan(closedAngle) + thickness * Math.tan(closedAngle)}, // C'
                {x: 0, y: height - depth * Math.tan(closedAngle)}      // C
            ];
        } else {
            // A ------- B --------------- F
            // |        /                  |
            // |       /                   |
            // |      /                    |
            // |     /                     |
            // D -- C -------------------- E
            vertices = [
                {x: depth - height / Math.tan(closedAngle), y: 0},      // A
                {x: width, y: 0},                                       // B
                {x: width, y: height},                                  // C
                {x: depth, y: height},                                  // D
                {x: depth - thickness / Math.tan(closedAngle), y: height - thickness}, // D'
                {x: width - thickness, y: height - thickness},          // C'
                {x: width - thickness, y: thickness},                   // B'
                {x: depth - height / Math.tan(closedAngle) +thickness / Math.tan(closedAngle), y: thickness}, // A'
                {x: depth - height / Math.tan(closedAngle), y: 0}       // A
            ];
        }

        // console.log("3D Box Vertices:", vertices);
        return vertices;
    }
    
    // Function to get 3D lid vertices
    get3DLidVertices() {
        const height = this.geometry.height;
        const depth = this.geometry.depth;
        const closedAngle = this.geometry.closedAngle;
        const thickness = this.lidThickness;
        const criticalAngle = Math.atan2(height, depth);
        
        let vertices;
        if (closedAngle <= criticalAngle) {
            // A -- B -------------------- F
            // |   /                       |
            // | /                         |
            // C                           |
            // |                           |
            // D ------------------------- E
            vertices = [
                {x: depth, y: height},                                  // B
                {x: 0, y: height},                                      // A
                {x: 0, y: height - depth * Math.tan(closedAngle)},      // C
                {x: thickness, y: height - depth * Math.tan(closedAngle) + thickness * Math.tan(closedAngle)},  // C'
                {x: thickness, y: height-thickness},                     // A'
                {x: depth - thickness / Math.tan(closedAngle), y: height - thickness},                     // B'
                {x: depth, y: height}                                   // B
            ];
        } else {
            // A ------- B --------------- F
            // |        /                  |
            // |       /                   |
            // |      /                    |
            // |     /                     |
            // D -- C -------------------- E
            vertices = [
                {x: depth, y: height},                              // B
                {x: 0, y: height},                                  // A
                {x: 0, y: 0},                                       // D
                {x: depth - height / Math.tan(closedAngle), y: 0},  // C
                {x: depth - height / Math.tan(closedAngle) + thickness / Math.tan(closedAngle), y: thickness},   // C'
                {x: thickness, y: thickness},                       // D'
                {x: thickness, y: height - thickness},              // A'
                {x: depth - thickness / Math.tan(closedAngle), y: height - thickness}, // B'
                {x: depth, y: height}                               // B, closing the polygon
            ];
        }
        // console.log("3D Lid Vertices:", vertices);
        return vertices;
    }
}
