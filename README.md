# hinge-generator
Generates an 'up and over' hinge configuration for a box with lid. The mechanism is based on a four bar linkage. The objective is to design a hinge that is both functional and pleasing to the user, and then to generate a template that helps the user build such a box.

This particular box and lid are designed such that the lid swings up and over the box and sits on the top, displaying its contents and acting like a display as well as a container.

Project designed by Hugo Grimmett, 2025.

Project plan:
- Visualise a box that is configurable by the user. The box has the following parameters: height (h), width (w), and the lid has depth (d) and angle (alpha). In the open position, there is a gap (g) between the back of the lid and the back of the box.
- Visualise the pivot points of the 4 bar linkage, allowing the user to choose their position given some geometric constraints. 
- Compute, and indicate to the user, whether the chosen configuration meets the requirements of being a valid hinge that meets the required motion. If the hinge is valid, then animate its motion.
- Allow the user to create a template which allows them to test or build this hinge design. The template should be at least a to-scale PDF that indicates (a) the positions of the 4-bar linkage pivot points relative to the box and lid, and (b) the lenghts of the input and output rods.
- As an extension, offer the generation of a file that can be given to a 3D printer to test the hinge mechanism prior to box manufacture.

## Features to Add


- [ ] Better legibility on "open lid" and "closed lid" text
- [ ] Animation restarts when scrolling - looks ungraceful
- [ ] Lock the pivot points in proportionally to the lid when changing the box parameters
- [ ] Throw a canvas warning when minDistFromShortLinkToTallPivot is close to zero
- [ ] Check for collisions and minDistFromShortLinkToTallPivot issues instantly when config is changed, rather than waiting for animation to finish
- [ ] Merge all STL pop-up warnings into a single warning
- [ ] Make default starting configuration valid to all checks
 
Interesting case where box rotates the wrong way: http://localhost:8000/?height=30&width=40&depth=15&alpha=75&gap=6&redBoxX=28.04&redBoxY=20.64&redClosedX=8.09&redClosedY=19.49&blueBoxX=15.90&blueBoxY=39.63&blueClosedX=10.03&blueClosedY=29.20


Collision test case: http://localhost:8000/?height=30&width=40&depth=10&alpha=75&gap=1&redBoxX=21.86&redBoxY=27.51&redClosedX=6.76&redClosedY=17.91&blueBoxX=24.29&blueBoxY=23.07&blueClosedX=2.41&blueClosedY=18.17


http://localhost:8000/?height=30.000&width=40.000&depth=10.000&alpha=1.309&gap=1.000&rcx=3.333&rcy=20.000&bcx=5.000&bcy=26.667&rbd=-3.000&bbd=3.000

http://localhost:8000/?height=30.000&width=40.000&depth=10.000&alpha=1.309&gap=1.000&rcx=3.333&rcy=20.000&bcx=5.000&bcy=26.667&rbd=-3.000&bbd=3.000

This one can't be manufactured because the rod collides with the axle: https://grimmett.io/hinge-generator/?height=35.000&width=50.000&depth=21.000&alpha=1.309&gap=1.000&rcx=16.313&rcy=24.138&bcx=4.861&bcy=31.641&rbd=-5.063&bbd=2.693
