def build_reason(edges, closures, via, objective, scenarios=()):
    if not edges:
        return "You’re already at your destination."

    names = {edge.name for edge in edges}
    if {"e-bridge-n", "e-bridge-s"} <= set(closures) and "Mill Causeway" in names:
        return "Harbor Bridge is closed, so this crosses at Mill Causeway."
    if "Harbor Bridge" in names:
        return "Crosses the river directly on Harbor Bridge."
    if "Mill Causeway" in names:
        return "Crosses the river at Mill Causeway under the selected conditions."

    if "Howrah Bridge" in names:
        return "Crosses the Hooghly River on Howrah Bridge."
    if "Vidyasagar Flyover" in names:
        howrah_closed = any(
            scenario["id"] == "howrah-bridge-closed" and scenario["closures"]
            and set(scenario["closures"]) <= set(closures)
            for scenario in scenarios
        )
        if howrah_closed:
            return "Howrah Bridge is closed, so this route uses Vidyasagar Flyover."
        return "Uses Vidyasagar Flyover to cross the Hooghly River."

    highway_m = sum(edge.length_m for edge in edges if edge.road_class == "highway")
    if highway_m:
        highway = next(edge.name for edge in edges if edge.road_class == "highway")
        return f"Follows {highway} for {highway_m:,} m of the trip."
    if objective == "fastest":
        return f"Uses {via} on the path with the lowest travel time under these conditions."
    return f"Uses {via} on the path with the shortest total road distance."
