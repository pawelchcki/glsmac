#pragma once

#include "PresentationTrace.h"

namespace ui::presentation {

// Native UI coord_t is float. Preserve each F32 value through JSON, including
// small coordinates and adjacent z-index values; never round to six decimals.
inline std::string GeometryFields( const std::string& area, const float left, const float top, const float right, const float bottom, const float zindex ) {
	return "{\"area\":" + Quote( area ) + ",\"left\":" + Float( left ) + ",\"top\":" + Float( top ) + ",\"right\":" + Float( right ) + ",\"bottom\":" + Float( bottom ) + ",\"zindex\":" + Float( zindex ) + "}";
}

}
