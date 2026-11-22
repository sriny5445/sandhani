from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class Slowdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    edge_id: Annotated[str, Field(min_length=1)]
    factor: Annotated[float, Field(ge=1e-290, le=1, strict=True)]


class RouteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    city_id: Annotated[str, Field(min_length=1)]
    origin: Annotated[str, Field(min_length=1)]
    destination: Annotated[str, Field(min_length=1)]
    objective: Literal["shortest", "fastest"]
    band: Literal["night", "midday", "peak_am", "peak_pm"]
    closures: list[str] = Field(default_factory=list)
    slowdowns: list[Slowdown] = Field(default_factory=list)
