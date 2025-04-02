// STL Generator for Hinge Box using JSCAD
class STLGenerator {
    constructor(boxGeometry) {
        // Get JSCAD modules from the global jscadModeling object
        this.modeling = jscadModeling;
        
        // Store geometry
        this.geometry = boxGeometry;
        
        // All dimensions in mm
        // Part thicknesses
        this.boxThickness = 4;     // Box thickness
        this.lidThickness = 4;     // Lid thickness
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
        this.holeDiameter = 4.4;   // Diameter of holes in links
        this.rimDiameter = 9;      // Diameter of rims around holes
        this.textDepth = 1;        // Depth of text engraving
        this.textHeight = this.linkWidth * 0.8; // Height of text (80% of link width)
        
        // Connecting arm dimensions
        this.armWidth = 4;         // Width of connecting arms
        this.armExtension = 5;     // Extra length to ensure arms reach into box
    }

    async generateZip() {
        const zip = new JSZip();
        
        try {
            // Generate all STLs
            const boxStl = await this.generateBoxSTL();
            const lidStl = await this.generateLidSTL();
            const linkTopStl = await this.generateLinkTopSTL();
            const linkBottomStl = await this.generateLinkBottomSTL();
            
            // Add to zip
            zip.file("box.stl", boxStl);
            zip.file("lid.stl", lidStl);
            zip.file("linkTop.stl", linkTopStl);
            zip.file("linkBottom.stl", linkBottomStl);
            
            // Generate and save zip
            const content = await zip.generateAsync({type: "blob"});
            saveAs(content, "hinge-box.zip");
        } catch (error) {
            console.error("Error generating STL files:", error);
            throw error;
        }
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
        
        // Create rectangle for arm - extend by armExtension to ensure it reaches into the box
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
        
        // Get lid vertices and create 2D shape - use closed lid vertices
        const vertices = this.geometry.getClosedLidVertices();
        const points = vertices.map(v => [v.x, v.y]);
        const polygon = geometries.geom2.fromPoints(points);
        
        // Extrude to thickness
        let lid = extrusions.extrudeLinear({height: this.lidThickness}, polygon);
        
        // Get red and blue lid points
        const redLidPoint = this.geometry.redClosedPoint;
        const blueLidPoint = this.geometry.blueClosedPoint;
        
        // Get red and blue box points to determine which is on top
        const redBoxPoint = this.geometry.redBoxPoint;
        const blueBoxPoint = this.geometry.blueBoxPoint;
        
        // Determine which point is on top (higher Y value) - use the same logic as for the box
        // If red box point is on top, then red lid point gets short pin
        // If blue box point is on top, then blue lid point gets short pin
        const isRedOnTop = redBoxPoint.y > blueBoxPoint.y;
        
        // Create red pin based on whether it's top or bottom
        const redPin = isRedOnTop ? 
            // Red is on top - make short pin
            primitives.cylinder({
                height: this.shortPinHeight,
                radius: this.shortPinDiameter / 2,
                center: [redLidPoint.x, redLidPoint.y, this.lidThickness + this.shortPinHeight / 2]
            }) : 
            // Red is on bottom - make tall pin (base + top)
            booleans.union(
                primitives.cylinder({
                    height: this.tallPinBaseHeight,
                    radius: this.tallPinBaseDiameter / 2,
                    center: [redLidPoint.x, redLidPoint.y, this.lidThickness + this.tallPinBaseHeight / 2]
                }),
                primitives.cylinder({
                    height: this.tallPinTopHeight,
                    radius: this.tallPinTopDiameter / 2,
                    center: [
                        redLidPoint.x, 
                        redLidPoint.y, 
                        this.lidThickness + this.tallPinBaseHeight + this.tallPinTopHeight / 2
                    ]
                })
            );
        
        // Create blue pin based on whether it's top or bottom
        const bluePin = isRedOnTop ? 
            // Red is on top, so blue is on bottom - make tall pin (base + top)
            booleans.union(
                primitives.cylinder({
                    height: this.tallPinBaseHeight,
                    radius: this.tallPinBaseDiameter / 2,
                    center: [blueLidPoint.x, blueLidPoint.y, this.lidThickness + this.tallPinBaseHeight / 2]
                }),
                primitives.cylinder({
                    height: this.tallPinTopHeight,
                    radius: this.tallPinTopDiameter / 2,
                    center: [
                        blueLidPoint.x, 
                        blueLidPoint.y, 
                        this.lidThickness + this.tallPinBaseHeight + this.tallPinTopHeight / 2
                    ]
                })
            ) : 
            // Red is on bottom, so blue is on top - make short pin
            primitives.cylinder({
                height: this.shortPinHeight,
                radius: this.shortPinDiameter / 2,
                center: [blueLidPoint.x, blueLidPoint.y, this.lidThickness + this.shortPinHeight / 2]
            });
        
        // Add pins to lid
        lid = booleans.union(lid, redPin, bluePin);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(lid);
        return new Blob([stlData], {type: 'model/stl'});
    }

    async generateLinkTopSTL() {
        const { primitives, transforms, booleans, extrusions, geometries, text } = this.modeling;
        
        // Get red and blue box points to determine which is on top
        const redBoxPoint = this.geometry.redBoxPoint;
        const blueBoxPoint = this.geometry.blueBoxPoint;
        
        // Determine which point is on top (higher Y value)
        const isRedOnTop = redBoxPoint.y > blueBoxPoint.y;
        
        // Get points for the top link
        const boxPoint = isRedOnTop ? redBoxPoint : blueBoxPoint;
        const lidPoint = isRedOnTop ? this.geometry.redOpenPoint : this.geometry.blueOpenPoint;
        
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
        
        try {
            // Create text "UPPER"
            const upperText = text.vectorText({
                height: this.textHeight,
                text: "UPPER",
                font: "helvetica",
                align: "center"
            });
            
            // Position text in the middle of the link
            const textGeom = transforms.translate([length / 2, 0, 0], upperText);
            
            // Extrude text
            const extrudedText = extrusions.extrudeLinear({height: this.textDepth}, textGeom);
            
            // Subtract text from link (engrave)
            link = booleans.subtract(link, extrudedText);
        } catch (error) {
            console.warn("Could not add text to link:", error);
            // Continue without text if there's an error
        }
        
        // Rotate and position link
        link = transforms.rotateZ(angle, link);
        link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(link);
        return new Blob([stlData], {type: 'model/stl'});
    }

    async generateLinkBottomSTL() {
        const { primitives, transforms, booleans, extrusions, geometries, text } = this.modeling;
        
        // Get red and blue box points to determine which is on top
        const redBoxPoint = this.geometry.redBoxPoint;
        const blueBoxPoint = this.geometry.blueBoxPoint;
        
        // Determine which point is on top (higher Y value)
        const isRedOnTop = redBoxPoint.y > blueBoxPoint.y;
        
        // Get points for the bottom link
        const boxPoint = isRedOnTop ? blueBoxPoint : redBoxPoint;
        const lidPoint = isRedOnTop ? this.geometry.blueOpenPoint : this.geometry.redOpenPoint;
        
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
        
        try {
            // Create text "LOWER"
            const lowerText = text.vectorText({
                height: this.textHeight,
                text: "LOWER",
                font: "helvetica",
                align: "center"
            });
            
            // Position text in the middle of the link
            const textGeom = transforms.translate([length / 2, 0, 0], lowerText);
            
            // Extrude text
            const extrudedText = extrusions.extrudeLinear({height: this.textDepth}, textGeom);
            
            // Subtract text from link (engrave)
            link = booleans.subtract(link, extrudedText);
        } catch (error) {
            console.warn("Could not add text to link:", error);
            // Continue without text if there's an error
        }
        
        // Rotate and position link
        link = transforms.rotateZ(angle, link);
        link = transforms.translate([boxPoint.x, boxPoint.y, 0], link);
        
        // Convert to STL binary data
        const stlData = this.serializeToStl(link);
        return new Blob([stlData], {type: 'model/stl'});
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
