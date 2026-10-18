#include "GeometryBindings.h"

#include "Geometry.h"
#include "gse/Exception.h"
#include "gse/callable/Native.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"

namespace game::backend::map::tile {

namespace {

int GetInteger( GSE_CALLABLE, const gse::value::function_arguments_t& arguments, const size_t index, const int minimum, const int maximum ) {
	const auto* value = arguments.at( index )->Deref();
	if ( value->type != gse::VT_INT ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Geometry argument must be an integer" );
	}
	const auto integer = ( (gse::value::Int*)value )->value;
	if ( integer < minimum || integer > maximum ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Geometry argument is out of range" );
	}
	return integer;
}

void CheckParity( GSE_CALLABLE, const int x, const int y ) {
	if ( x % 2 != y % 2 ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Tile coordinates must have equal parity" );
	}
}

}

gse::Value* WrapGeometry( GSE_CALLABLE ) {
	gse::value::object_properties_t properties = {
		{
			"raw_vector_distance",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 2 );
				const auto dx = GetInteger( GSE_CALL, arguments, 0, -4095, 4095 );
				const auto dy = GetInteger( GSE_CALL, arguments, 1, -4095, 4095 );
				return VALUE( gse::value::Int,, GetRawVectorDistance( dx, dy ) );
			} )
		},
		{
			"vector_distance",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 7 );
				const auto width = GetInteger( GSE_CALL, arguments, 0, 4, 4096 );
				const auto height = GetInteger( GSE_CALL, arguments, 1, 2, 4096 );
				N_GETVALUE( flat, 2, Bool );
				const auto x1 = GetInteger( GSE_CALL, arguments, 3, 0, width - 1 );
				const auto y1 = GetInteger( GSE_CALL, arguments, 4, 0, height - 1 );
				const auto x2 = GetInteger( GSE_CALL, arguments, 5, 0, width - 1 );
				const auto y2 = GetInteger( GSE_CALL, arguments, 6, 0, height - 1 );
				if ( width % 2 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Map width must be even" );
				}
				CheckParity( GSE_CALL, x1, y1 );
				CheckParity( GSE_CALL, x2, y2 );
				return VALUE( gse::value::Int,, GetVectorDistance( x1, y1, x2, y2, width, flat ) );
			} )
		},
		{
			"same_row_distance",
			NATIVE_CALL() {
				N_EXPECT_ARGS( 4 );
				const auto width = GetInteger( GSE_CALL, arguments, 0, 4, 4096 );
				const auto x1 = GetInteger( GSE_CALL, arguments, 1, 0, width - 1 );
				const auto x2 = GetInteger( GSE_CALL, arguments, 2, 0, width - 1 );
				const auto y = GetInteger( GSE_CALL, arguments, 3, 0, 4095 );
				if ( width % 2 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Map width must be even" );
				}
				CheckParity( GSE_CALL, x1, y );
				CheckParity( GSE_CALL, x2, y );
				return VALUE( gse::value::Int,, GetTileDistance( x1, y, x2, y, width ) );
			} )
		},
	};
	return VALUE( gse::value::Object,, ctx, si, ep, properties );
}

}
