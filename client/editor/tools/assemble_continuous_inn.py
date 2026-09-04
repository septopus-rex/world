import json

LEVEL_PATH = 'client/core/src/levels/pal1_inn.level.json'

with open(LEVEL_PATH, 'r') as f:
    data = json.load(f)

block = data['blocks'][0]

# 1. Row 0: 162 Boxes (8 items)
# 1F ground + 3 2F walkways + 4 outer backer walls
boxes = [
    # 1F ground slab
    [[12, 12, 0.2], [8, 8, -0.1], [0, 0, 0], 0, [4, 4], 0, 1, 96],
    # 2F West walkway slab
    [[2.4, 9.6, 0.15], [3.2, 6.8, 2.8], [0, 0, 0], 0, [1, 4], 0, 1, 97],
    # 2F North walkway slab
    [[12, 2.4, 0.15], [8, 12.8, 2.8], [0, 0, 0], 0, [4, 1], 0, 1, 97],
    # 2F East walkway slab
    [[2.4, 9.6, 0.15], [12.8, 6.8, 2.8], [0, 0, 0], 0, [1, 4], 0, 1, 97],
    # West backer wall
    [[0.15, 12, 5.6], [2.0, 8, 2.8], [0, 0, 0], 0, [3, 2], 0, 1, 98],
    # North backer wall
    [[12, 0.15, 5.6], [8, 14.0, 2.8], [0, 0, 0], 0, [3, 2], 0, 1, 98],
    # East backer wall
    [[0.15, 12, 5.6], [14.0, 8, 2.8], [0, 0, 0], 0, [3, 2], 0, 1, 98],
    # South entrance wall left & right
    [[4.5, 0.15, 5.6], [4.25, 2.0, 2.8], [0, 0, 0], 0, [1, 2], 0, 1, 98],
    [[5.5, 0.15, 5.6], [11.25, 2.0, 2.8], [0, 0, 0], 0, [1, 2], 0, 1, 98]
]

# 2. Row 1: 167 Ball/Columns (2 items)
columns = [
    [[0.28, 0.28, 2.8], [4.4, 11.6, 1.4], [0, 0, 0], 12, 0, 0],
    [[0.28, 0.28, 2.8], [11.6, 11.6, 1.4], [0, 0, 0], 12, 0, 0]
]

# 3. Row 2: 164 Modules (48 items)
modules = []

# Furniture (8 items)
modules.append([[2.2, 1.6, 1.05], [4.2, 4.5, 0.05], [0, 0, 0], 90, 0, 0]) # Counter
modules.append([[1.4, 0.8, 1.6], [2.8, 5.8, 0.05], [0, 0.3, 0], 86, 0, 0]) # Kitchen shelf
modules.append([[1.8, 3.4, 2.8], [3.2, 11.6, 0.05], [0, 0.785398, 0], 91, 0, 0]) # Stairs
modules.append([[1.6, 1.6, 0.85], [7.5, 7.5, 0.05], [0, 0.1, 0], 85, 0, 0]) # Table 1
modules.append([[1.6, 1.6, 0.85], [10.5, 6.0, 0.05], [0, -0.2, 0], 85, 0, 0]) # Table 2
modules.append([[1.6, 1.6, 0.85], [7.8, 4.2, 0.05], [0, 0.15, 0], 85, 0, 0]) # Table 3
modules.append([[0.8, 0.8, 1.2], [4.2, 5.1, 1.1], [0, 0, 0], 92, 0, 0]) # Bonsai on counter
modules.append([[0.8, 0.8, 1.2], [5.0, 11.6, 0.05], [0, 0, 0], 92, 0, 0]) # Bonsai near stairs

# Railings (12 items)
# North gallery (4 sections across X=4.4 to 11.6)
for rx in [5.4, 7.4, 9.4, 11.0]:
    modules.append([[2.0, 0.1, 0.85], [rx, 11.6, 3.28], [0, 0, 0], 94, 0, 0])
# East gallery (4 sections along Y)
for ry in [3.4, 5.4, 7.4, 9.4]:
    modules.append([[2.0, 0.1, 0.85], [11.6, ry, 3.28], [0, 0.785398, 0], 94, 0, 0])
# West gallery (4 sections along Y)
for ry in [3.4, 5.4, 7.4, 9.4]:
    modules.append([[2.0, 0.1, 0.85], [4.4, ry, 3.28], [0, 0.785398, 0], 94, 0, 0])

# 3D Continuous Window & Door Bays (28 items, W=2.4m each!)
# 2F North Wall (5 bays along X, y=13.9, z=4.15)
# x = 3.2 (window), 5.6 (window), 8.0 (Door A), 10.4 (window), 12.8 (Door B)
modules.append([[2.4, 0.14, 2.65], [3.2, 13.9, 4.15], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [5.6, 13.9, 4.15], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [8.0, 13.9, 4.15], [0, 0, 0], 95, 0, 0]) # Room A
modules.append([[2.4, 0.14, 2.65], [10.4, 13.9, 4.15], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [12.8, 13.9, 4.15], [0, 0, 0], 95, 0, 0]) # Room B

# 2F West Wall (4 bays along Y, x=2.1, z=4.15, rot=45 deg)
for wy in [3.2, 5.6, 8.0, 10.4]:
    modules.append([[2.4, 0.14, 2.65], [2.1, wy, 4.15], [0, 0.785398, 0], 93, 0, 0])

# 2F East Wall (4 bays along Y, x=13.9, z=4.15, rot=-45 deg -> faces West into room)
modules.append([[2.4, 0.14, 2.65], [13.9, 3.2, 4.15], [0, -0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [13.9, 5.6, 4.15], [0, -0.785398, 0], 95, 0, 0]) # Room C
modules.append([[2.4, 0.14, 2.65], [13.9, 8.0, 4.15], [0, -0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [13.9, 10.4, 4.15], [0, -0.785398, 0], 93, 0, 0])

# 1F North Wall (5 bays along X, y=13.9, z=1.35)
modules.append([[2.4, 0.14, 2.65], [3.2, 13.9, 1.35], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [5.6, 13.9, 1.35], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [8.0, 13.9, 1.35], [0, 0, 0], 95, 0, 0]) # Room D doorway
modules.append([[2.4, 0.14, 2.65], [10.4, 13.9, 1.35], [0, 0, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [12.8, 13.9, 1.35], [0, 0, 0], 93, 0, 0])

# 1F West Wall (4 bays along Y, x=2.1, z=1.35, rot=45 deg -> faces East into room)
modules.append([[2.4, 0.14, 2.65], [2.1, 3.2, 1.35], [0, 0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [2.1, 5.6, 1.35], [0, 0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [2.1, 8.0, 1.35], [0, 0.785398, 0], 95, 0, 0]) # Doorway F (kitchen/yard)
modules.append([[2.4, 0.14, 2.65], [2.1, 10.4, 1.35], [0, 0.785398, 0], 93, 0, 0])

# 1F East Wall (4 bays along Y, x=13.9, z=1.35, rot=-45 deg -> faces West into room)
modules.append([[2.4, 0.14, 2.65], [13.9, 3.2, 1.35], [0, -0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [13.9, 5.6, 1.35], [0, -0.785398, 0], 95, 0, 0]) # Doorway E
modules.append([[2.4, 0.14, 2.65], [13.9, 8.0, 1.35], [0, -0.785398, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [13.9, 10.4, 1.35], [0, -0.785398, 0], 93, 0, 0])

# 1F South Wall (2 bays flanking entrance, y=2.1, z=1.35, rot=180 deg -> faces North into room)
modules.append([[2.4, 0.14, 2.65], [3.2, 2.1, 1.35], [0, 1.570796, 0], 93, 0, 0])
modules.append([[2.4, 0.14, 2.65], [12.8, 2.1, 1.35], [0, 1.570796, 0], 93, 0, 0])

# 4. Row 3: 163 Lights (3 items)
lights = [
    [0, [8.0, 8.0, 4.8], [0, 0, 0], 0xffe0a0, 3.5, 14, 0, 0],
    [0, [8.0, 12.8, 4.5], [0, 0, 0], 0xffd882, 2.2, 10, 0, 0],
    [0, [4.4, 8.0, 4.5], [0, 0, 0], 0xffd882, 2.0, 10, 0, 0]
]

# 5. Row 4: 180 Stops (2 items)
stops = [
    [0, [2.2, 1.6, 1.05], [4.2, 4.5, 0.525], [0, 0, 0]],
    [2, [1.8, 3.4, 2.8], [3.2, 11.6, 1.4], [0, 0.785398, 0]]
]

total_count = len(boxes) + len(columns) + len(modules) + len(lights) + len(stops)
print(f"Total entity count: boxes={len(boxes)}, cols={len(columns)}, modules={len(modules)}, lights={len(lights)}, stops={len(stops)} => TOTAL={total_count}")
assert total_count <= 64, f"Exceeded 64 entity limit: {total_count}"

block['raw'][2] = [
    [162, boxes],
    [167, columns],
    [164, modules],
    [163, lights],
    [180, stops]
]

with open(LEVEL_PATH, 'w') as f:
    json.dump(data, f, indent=2)

print("pal1_inn.level.json successfully updated!")
