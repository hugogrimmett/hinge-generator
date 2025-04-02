// STL Generator for Hinge Box using JSCAD
class STLGenerator {
    constructor(boxGeometry, units = 'cm') {
        // Get JSCAD modules from the global jscadModeling object
        this.modeling = jscadModeling;
        
        // Store geometry and apply scaling to the geometry dimensions
        this.units = units;
        this.scaleFactor = this.getScaleFactor(units);
        
        // Create a scaled copy of the geometry
        this.geometry = this.createScaledGeometry(boxGeometry);
        
        // All dimensions in mm - these are fixed regardless of units
        // Part thicknesses
        this.boxThickness = 4;     // Box thickness
        this.lidThickness = this.boxThickness;     // Lid thickness
        this.linkThickness = 2.5;  // Link thickness
        
        // Pin dimensions
        this.shortPinDiameter = 4;   // Short pin diameter
        this.shortPinHeight = 3;     // Short pin height
        
        this.tallPinBaseDiameter = 5;  // Tall pin base diameter
        this.tallPinBaseHeight = 3.5;  // Tall pin base height
        this.tallPinTopDiameter = 4;   // Tall pin top diameter
        this.tallPinTopHeight = 3;     // Tall pin top height
        
        // Link dimensions
        this.linkWidth = 4;        // Width of link arms
        this.axleTolerance = 0.2;  // Tolerance for rotational joint (diameter)
        this.holeDiameter = 4 + this.axleTolerance;   // Diameter of holes in links
        this.rimDiameter = 9;      // Diameter of rims around holes
        this.textDepth = 1;        // Depth of text engraving
        this.textHeight = this.linkWidth * 0.8; // Height of text (80% of link width)
        
        // Connecting arm dimensions
        this.armWidth = 4;         // Width of connecting arms
        this.armExtension = 5;     // Extra length to ensure arms reach into box
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
        const zip = new JSZip();
        
        // Generate all STLs
        const boxStl = await this.generateBoxSTL();
        const lidStl = await this.generateLidSTL();
        const linkTopStl = await this.generateLinkSTL("UPPER", true);
        const linkBottomStl = await this.generateLinkSTL("LOWER", false);
        
        // Add to zip
        zip.file("box.stl", boxStl);
        zip.file("lid.stl", lidStl);
        zip.file("linkTop.stl", linkTopStl);
        zip.file("linkBottom.stl", linkBottomStl);
        
        // Generate info text file
        const infoText = this.generateInfoText();
        zip.file("hinge-info.txt", infoText);
        
        // Generate and save zip
        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, "hinge-box.zip");
    }

    async generateBoxSTL() {
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
        const topPin = primitives.cylinder({
            height: this.shortPinHeight,
            radius: this.shortPinDiameter / 2,
            center: [topBoxPoint.x, topBoxPoint.y, this.boxThickness + this.shortPinHeight / 2]
        });
        
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
        
        // Combine the bottom pin parts
        const bottomPin = booleans.union(bottomBasePin, bottomTopPin);
        
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
        return new Blob([stlData], {type: 'model/stl'});
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

    async generateLidSTL() {
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
        const topPin = primitives.cylinder({
            height: this.shortPinHeight,
            radius: this.shortPinDiameter / 2,
            segments: 32,
            center: [topLidPoint.x, topLidPoint.y, this.lidThickness + this.shortPinHeight / 2]
        });
        
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
        
        // Combine the bottom pin parts
        const bottomPin = booleans.union(bottomBasePin, bottomTopPin);
        
        // Check if red point is outside lid and add connecting arm if needed
        if (!this.isPointInPolygon(redLidPoint, vertices)) {
            const redArm = this.createConnectingArm(center, redLidPoint);
            lid = booleans.union(lid, redArm);
        }
        
        // Check if blue point is outside lid and add connecting arm if needed
        if (!this.isPointInPolygon(blueLidPoint, vertices)) {
            const blueArm = this.createConnectingArm(center, blueLidPoint);
            lid = booleans.union(lid, blueArm);
        }
        
        // Add pins to lid
        lid = booleans.union(lid, topPin);
        lid = booleans.union(lid, bottomPin);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(lid);
        return new Blob([stlData], {type: 'model/stl'});
    }

    async generateLinkSTL(labelText, isTop) {
        const { primitives, transforms, booleans, extrusions, geometries } = this.modeling;
        
        // Get red and blue box points to determine which is on top
        const redBoxPoint = this.geometry.redBoxPoint;
        const blueBoxPoint = this.geometry.blueBoxPoint;
        
        // Determine which point is on top (higher Y value)
        const isRedOnTop = redBoxPoint.y > blueBoxPoint.y;
        
        // Get points for the link based on whether it's top or bottom
        let boxPoint, lidPoint;
        if (isTop) {
            boxPoint = isRedOnTop ? redBoxPoint : blueBoxPoint;
            lidPoint = isRedOnTop ? this.geometry.redOpenPoint : this.geometry.blueOpenPoint;
        } else {
            boxPoint = isRedOnTop ? blueBoxPoint : redBoxPoint;
            lidPoint = isRedOnTop ? this.geometry.blueOpenPoint : this.geometry.redOpenPoint;
        }
        
        // Calculate link dimensions
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
        
        // Add text if available - use a simple engraved rectangle with the label
        if (labelText) {
            // Create a simple rectangle for the text
            const textWidth = length * 0.6;
            const textHeight = this.linkWidth * 0.6;
            
            // Create a smaller rectangle for the text area
            const textRect = primitives.rectangle({
                size: [textWidth, textHeight],
                center: [length / 2, 0]
            });
            
            // Create a smaller rectangle for the actual text (engraved)
            const textEngraving = primitives.rectangle({
                size: [textWidth * 0.8, textHeight * 0.6],
                center: [length / 2, 0]
            });
            
            // Extrude the text area to create a raised platform
            const textPlatform = extrusions.extrudeLinear({height: this.textDepth * 0.5}, textRect);
            
            // Extrude the text engraving deeper
            const textCutout = extrusions.extrudeLinear({height: this.textDepth}, textEngraving);
            
            // Add the platform to the link
            link = booleans.union(link, textPlatform);
            
            // Subtract the text cutout to create the engraved effect
            link = booleans.subtract(link, textCutout);
        }
        
        // Rotate and position link
        link = transforms.rotateZ(angle, link);
        link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(link);
        return new Blob([stlData], {type: 'model/stl'});
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
}
