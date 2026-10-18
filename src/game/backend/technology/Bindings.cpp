#include "Bindings.h"

#include "Table.h"
#include "game/backend/Game.h"
#include "gse/Exception.h"
#include "gse/callable/Native.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include "gse/value/Undefined.h"

namespace game::backend::technology {

namespace {

int GetInteger( GSE_CALLABLE, const gse::value::function_arguments_t& arguments, const size_t index, const int minimum, const int maximum ) {
	const auto* value = arguments.at( index )->Deref();
	if ( value->type != gse::VT_INT ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Technology argument must be an integer" );
	}
	const auto integer = ( (gse::value::Int*)value )->value;
	if ( integer < minimum || integer > maximum ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Technology argument is out of range" );
	}
	return integer;
}

}

gse::Value* WrapTable( GSE_CALLABLE, Table& table, Game* const write_guard ) {
	gse::value::object_properties_t properties = {
		{
			"set",
			NATIVE_CALL( &table, write_guard ) {
				N_EXPECT_ARGS( 4 );
				const auto id = GetInteger( GSE_CALL, arguments, 0, 0, 88 );
				N_GETVALUE( prerequisites, 1, Array );
				const auto owners = GetInteger( GSE_CALL, arguments, 2, 0, 255 );
				N_GETVALUE( weights, 3, Array );
				if ( prerequisites.size() != 2 || weights.size() != 4 ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Expected two prerequisites and four technology weights" );
				}
				Table::Technology technology;
				for ( size_t i = 0; i < prerequisites.size(); i++ ) {
					technology.prerequisites[ i ] = GetInteger( GSE_CALL, prerequisites, i, -2, 88 );
				}
				technology.owners = owners;
				for ( size_t i = 0; i < weights.size(); i++ ) {
					technology.weights[ i ] = GetInteger( GSE_CALL, weights, i, -32768, 32767 );
				}
				if ( write_guard ) {
					write_guard->CheckRW( GSE_CALL );
				}
				table.Set( id, technology );
				return VALUE( gse::value::Undefined );
			} )
		},
		{
			"has_tech",
			NATIVE_CALL( &table ) {
				N_EXPECT_ARGS( 2 );
				const auto id = GetInteger( GSE_CALL, arguments, 0, -2, 89 );
				const auto faction = GetInteger( GSE_CALL, arguments, 1, 0, 7 );
				return VALUE( gse::value::Bool,, table.HasTech( id, faction ) );
			} )
		},
		{
			"category",
			NATIVE_CALL( &table ) {
				N_EXPECT_ARGS( 1 );
				const auto id = GetInteger( GSE_CALL, arguments, 0, 0, 88 );
				return VALUE( gse::value::Int,, table.GetCategory( id ) );
			} )
		},
		{
			"available",
			NATIVE_CALL( &table ) {
				N_EXPECT_ARGS( 3 );
				const auto id = GetInteger( GSE_CALL, arguments, 0, 0, 88 );
				const auto faction = GetInteger( GSE_CALL, arguments, 1, 0, 7 );
				N_GETVALUE( expansion, 2, Bool );
				return VALUE( gse::value::Bool,, table.IsAvailable( id, faction, expansion ) );
			} )
		},
		{
			"is_prerequisite",
			NATIVE_CALL( &table ) {
				N_EXPECT_ARGS( 3 );
				const auto ancestor = GetInteger( GSE_CALL, arguments, 0, -2, 88 );
				const auto id = GetInteger( GSE_CALL, arguments, 1, -2, 88 );
				const auto depth = GetInteger( GSE_CALL, arguments, 2, 0, 5 );
				return VALUE( gse::value::Bool,, table.IsPrerequisite( ancestor, id, depth ) );
			} )
		},
	};
	return VALUE( gse::value::Object,, ctx, si, ep, properties );
}

}
