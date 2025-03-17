import numpy as np
from scipy.optimize import fsolve

def equations(vars, h, w, d, alpha, g):
    # Unpack variables
    x1, y1, x2, y2 = vars  # Pivot points on box (x1, y1) and lid (x2, y2)
    
    # Convert alpha from degrees to radians
    alpha_rad = np.radians(alpha)
    
    # Define equations
    eq1 = x2 - (w - d)  # Lid attachment point constraint in closed position
    eq2 = y2 - h  # Lid attachment height in closed position
    eq3 = (x2 - x1)**2 + (y2 - y1)**2 - (g**2)  # Constraint based on the gap g in open position
    eq4 = (y1 - h + (d * np.tan(alpha_rad)))  # Ensure correct geometry at the pivot
    
    return [eq1, eq2, eq3, eq4]

def solve_pivot_points(h, w, d, alpha, g):
    # Initial guess for (x1, y1, x2, y2)
    initial_guess = [w / 2, h / 2, w - d, h]
    
    # Solve equations
    solution = fsolve(equations, initial_guess, args=(h, w, d, alpha, g))
    
    # Extract results
    x1, y1, x2, y2 = solution
    return (x1, y1), (x2, y2)

# Example usage
h = 10  # Box height
w = 15  # Box width
d = 5   # Depth of lid when closed
alpha = 30  # Angle of lid cut in degrees
g = 2   # Gap in open position

pivot_box, pivot_lid = solve_pivot_points(h, w, d, alpha, g)
print("Pivot on Box:", pivot_box)
print("Pivot on Lid:", pivot_lid)
