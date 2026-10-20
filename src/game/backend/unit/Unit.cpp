#include "Unit.h"

#include <memory>
#include <cmath>

#include "gse/context/Context.h"
#include "gse/value/Object.h"
#include "gse/value/Int.h"
#include "gse/value/Float.h"
#include "gse/value/Bool.h"
#include "gse/value/Ptr.h"
#include "gse/callable/Native.h"
#include "game/backend/Game.h"
#include "game/backend/State.h"
#include "game/backend/slot/Slot.h"
#include "game/backend/slot/Slots.h"
#include "game/backend/map/Map.h"
#include "MoraleSet.h"
#include "StaticDef.h"
#include "UnitManager.h"
#include "gse/ExecutionPointer.h"

namespace game {
namespace backend {
namespace unit {

static size_t next_id = 1;
const size_t Unit::GetNextId() {
	return next_id;
}
const void Unit::SetNextId( const size_t id ) {
	next_id = id;
}

Unit::Unit(
	GSE_CALLABLE,
	UnitManager* um,
	const size_t id,
	Def* def,
	slot::Slot* owner,
	map::tile::Tile* tile,
	const movement_t movement,
	const morale_t morale,
	const health_t health,
	const bool moved_this_turn
)
	: MapObject( um->GetMap(), tile )
	, m_um( um )
	, m_id( id )
	, m_def( def )
	, m_owner( owner )
	, m_movement( movement )
	, m_morale( morale )
	, m_health( health )
	, m_moved_this_turn( moved_this_turn ) {
	if ( next_id <= id ) {
		next_id = id + 1;
	}
	SetTile( GSE_CALL, tile );
}

const movement_t Unit::MINIMUM_MOVEMENT_TO_KEEP = 0.025f;
const movement_t Unit::MINIMUM_HEALTH_TO_KEEP = 0.025f;

Unit::~Unit() { *m_order_handle = nullptr; }

const bool Unit::HasMovesLeft() const {
	return m_movement >= unit::Unit::MINIMUM_MOVEMENT_TO_KEEP;
}

const bool Unit::NeedsOrders() const {
	return m_health >= MINIMUM_HEALTH_TO_KEEP && HasMovesLeft() && m_order == order_t::NO_ORDERS;
}

order_t Unit::GetOrder() const { return m_order; }

void Unit::SetOrder( const order_t order ) {
	ASSERT( order == order_t::NO_ORDERS || order == order_t::HOLD || order == order_t::SENTRY || ( order == order_t::TERRAFORM && !m_work.action.empty() ), "Invalid native unit order" );
	m_order = order;
}

bool Unit::ValidWork( const work_state_t& work, const map::Map* map ) {
	if ( work.action.empty() ) {
		return work.work_units == 0 && work.required_work == 0 && work.last_turn == 0 && work.previous_work_units == 0 &&
			work.previous_movement == 0.0f && !work.previous_moved && work.tile_x == 0 && work.tile_y == 0;
	}
	return ( work.action == "road" || work.action == "farm" || work.action == "mine" || work.action == "forest" ) &&
		work.required_work >= 2 && work.required_work <= 128 && work.work_units >= 0 && work.work_units < work.required_work &&
		work.last_turn >= 0 && work.previous_work_units >= 0 && work.previous_work_units <= work.work_units &&
		std::isfinite( work.previous_movement ) && work.previous_movement >= 0.0f && work.previous_movement <= 64.0f &&
		work.tile_x >= 0 && work.tile_y >= 0 && static_cast< uint64_t >( work.tile_x ) < map->GetWidth() &&
		static_cast< uint64_t >( work.tile_y ) < map->GetHeight() && work.tile_x % 2 == work.tile_y % 2;
}

void Unit::CheckLive( GSE_CALLABLE ) const {
	if ( m_um->GetUnit( m_id ) != this ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer belongs to its manager" ); }
}

const std::string& Unit::GetMoraleString() const {
	return m_def->m_moraleset->m_morale_values.at( m_morale ).m_name;
}

void Unit::SetTile( GSE_CALLABLE, map::tile::Tile* tile ) {
	if ( m_tile ) {
		m_tile->units.erase( m_id );
	}
	ASSERT( tile->units.find( m_id ) == tile->units.end(), "duplicate unit id in tile" );
	tile->units.insert(
		{
			m_id,
			this
		}
	);
	m_tile = tile;
}

const types::Buffer Unit::Serialize( const Unit* unit ) {
	types::Buffer buf;
	buf.WriteInt( unit->m_id );
	buf.WriteString( Def::Serialize( unit->m_def ).ToString() );
	buf.WriteInt( unit->m_owner->GetIndex() );
	buf.WriteInt( unit->m_tile->coord.x );
	buf.WriteInt( unit->m_tile->coord.y );
	buf.WriteFloat( unit->m_movement );
	buf.WriteInt( unit->m_morale );
	buf.WriteFloat( unit->m_health );
	buf.WriteBool( unit->m_moved_this_turn );
	buf.WriteInt( static_cast< uint8_t >( unit->GetOrder() ) );
	if ( !unit->m_work.action.empty() ) {
		const auto& work = unit->m_work;
		buf.WriteString( "unit-work-v1" ); buf.WriteString( work.action );
		buf.WriteInt( work.work_units ); buf.WriteInt( work.required_work ); buf.WriteInt( work.last_turn );
		buf.WriteInt( work.previous_work_units ); buf.WriteFloat( work.previous_movement ); buf.WriteBool( work.previous_moved );
		buf.WriteInt( work.tile_x ); buf.WriteInt( work.tile_y );
	}
	return buf;
}

Unit* Unit::Deserialize( GSE_CALLABLE, types::Buffer& buf, UnitManager* um ) {
	ASSERT( um, "um is null" );
	const auto id = buf.ReadInt();
	auto defbuf = types::Buffer( buf.ReadString() );
	std::unique_ptr< Def > def( Def::Deserialize( defbuf, um ) );
	auto* slot = um->GetSlot( buf.ReadInt() );
	const auto pos_x = buf.ReadInt();
	const auto pos_y = buf.ReadInt();
	auto* tile = um->GetMap()->GetTile( pos_x, pos_y );
	const auto movement = (movement_t)buf.ReadFloat();
	const auto morale = (morale_t)buf.ReadInt();
	const auto health = (health_t)buf.ReadFloat();
	const auto moved_this_turn = buf.ReadBool();
	// UnitManager stores each unit in its own length-delimited string. Older
	// candidate snapshots end here; only those exact legacy payloads default
	// to no orders. A present extension must be complete and recognized.
	auto order = order_t::NO_ORDERS;
	work_state_t work;
	if ( buf.lenr != buf.lenw ) {
		const auto encoded = buf.ReadInt();
		if ( encoded < static_cast< int64_t >( order_t::NO_ORDERS ) || encoded > static_cast< int64_t >( order_t::SENTRY ) ) { THROW( "Invalid serialized unit order" ); }
		order = static_cast< order_t >( encoded );
		if ( buf.lenr != buf.lenw ) {
			if ( buf.ReadString() != "unit-work-v1" ) { THROW( "Unknown serialized unit work extension" ); }
			work.action = buf.ReadString(); work.work_units = buf.ReadInt(); work.required_work = buf.ReadInt(); work.last_turn = buf.ReadInt();
			work.previous_work_units = buf.ReadInt(); work.previous_movement = buf.ReadFloat(); work.previous_moved = buf.ReadBool();
			work.tile_x = buf.ReadInt(); work.tile_y = buf.ReadInt();
			if ( work.action.empty() || !ValidWork( work, um->GetMap() ) ) { THROW( "Invalid serialized unit work" ); }
			if ( buf.lenr != buf.lenw ) { THROW( "Trailing data after serialized unit work" ); }
		}
	}
	if ( order == order_t::TERRAFORM && ( work.action.empty() || work.last_turn == 0 ) ) { THROW( "Missing active unit work" ); }
	auto* unit = new Unit( GSE_CALL, um, id, def.get(), slot, tile, movement, morale, health, moved_this_turn );
	def.release();
	unit->m_work = work;
	unit->SetOrder( order );
	return unit;
}

WRAPIMPL_SERIALIZE( Unit )
	buf->WriteInt( obj->m_id );
}

WRAPIMPL_DESERIALIZE( Unit )
	const auto id = buf->ReadInt();
	const auto& unit = game->GetUM()->GetUnit( id );
	ASSERT( unit, "base id not found: " + std::to_string( id ) );
	return unit->Wrap( GSE_CALL );
}

WRAPIMPL_DYNAMIC_GETTERS( Unit )
	WRAPIMPL_GET_CUSTOM( "id", Int, m_id )
	WRAPIMPL_GET_CUSTOM( "def", String, m_def->m_id )
	WRAPIMPL_GET_CUSTOM( "owner", Int, m_owner->GetIndex() )
	WRAPIMPL_GET_CUSTOM( "tile", Object, GSE_CALL_NOGC, {
		{ "x", VALUE( gse::value::Int,, m_tile->coord.x ) },
		{ "y", VALUE( gse::value::Int,, m_tile->coord.y ) },
	} )
	WRAPIMPL_GET_PTR( "movement", m_movement )
	WRAPIMPL_GET_PTR( "morale", m_morale )
	WRAPIMPL_GET_PTR( "health", m_health )
	WRAPIMPL_GET_PTR( "moved_this_turn", m_moved_this_turn )
	WRAPIMPL_GET_CUSTOM( "is_immovable", Bool, m_def->GetMovementType() == MT_IMMOVABLE )
	WRAPIMPL_GET_CUSTOM( "is_land", Bool, m_def->GetMovementType() == MT_LAND )
	WRAPIMPL_GET_CUSTOM( "is_water", Bool, m_def->GetMovementType() == MT_WATER )
	WRAPIMPL_GET_CUSTOM( "is_air", Bool, m_def->GetMovementType() == MT_AIR )
	WRAPIMPL_LINK( "get_def", m_def )
	WRAPIMPL_LINK( "get_owner", m_owner )
	WRAPIMPL_LINK( "get_tile", m_tile )
	{
		"get_order", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 0 );
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL );
			return VALUE( gse::value::String,, unit->GetOrder() == order_t::TERRAFORM ? "TERRAFORM" : ( unit->GetOrder() == order_t::SENTRY ? "SENTRY" : ( unit->GetOrder() == order_t::HOLD ? "HOLD" : "NO_ORDERS" ) ) );
		} )
	},
	{
		"needs_orders", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 0 );
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL );
			return VALUE( gse::value::Bool,, unit->NeedsOrders() );
		} )
	},
	{
		"set_order", NATIVE_CALL( handle = m_order_handle ) {
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL );
			unit->m_um->m_game->CheckRW( GSE_CALL );
			unit->CheckCustomMutation( GSE_CALL );
			N_EXPECT_ARGS( 1 ); N_GETVALUE( name, 0, String );
			order_t order;
			if ( name == "NO_ORDERS" ) { order = order_t::NO_ORDERS; }
			else if ( name == "HOLD" ) { order = order_t::HOLD; }
			else if ( name == "SENTRY" ) { order = order_t::SENTRY; }
			else { GSE_ERROR( gse::EC.INVALID_CALL, "Unsupported unit order: " + name ); }
			if ( unit->GetOrder() != order ) { unit->SetOrder( order ); unit->m_um->RefreshUnit( GSE_CALL, unit ); }
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"get_terraforming", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 0 ); auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL );
			const auto& work = unit->m_work;
			return VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "action", VALUE( gse::value::String,, work.action ) },
				{ "work_units", VALUE( gse::value::Int,, work.work_units ) },
				{ "required_work", VALUE( gse::value::Int,, work.required_work ) },
				{ "last_turn", VALUE( gse::value::Int,, work.last_turn ) },
				{ "previous_work_units", VALUE( gse::value::Int,, work.previous_work_units ) },
				{ "previous_movement", VALUE( gse::value::Float,, work.previous_movement ) },
				{ "previous_moved", VALUE( gse::value::Bool,, work.previous_moved ) },
				{ "tile_x", VALUE( gse::value::Int,, work.tile_x ) }, { "tile_y", VALUE( gse::value::Int,, work.tile_y ) },
				{ "active", VALUE( gse::value::Bool,, unit->GetOrder() == order_t::TERRAFORM ) },
			} );
		} )
	},
	{
		"set_terraforming", NATIVE_CALL( handle = m_order_handle ) {
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL );
			N_EXPECT_ARGS( 1 ); N_GETVALUE( data, 0, Object );
			if ( data.size() != 10 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete unit work state" ); }
			N_GETPROP( action, data, "action", String ); N_GETPROP( work_units, data, "work_units", Int );
			N_GETPROP( required_work, data, "required_work", Int ); N_GETPROP( last_turn, data, "last_turn", Int );
			N_GETPROP( previous_work_units, data, "previous_work_units", Int ); N_GETPROP( previous_movement, data, "previous_movement", Float );
			N_GETPROP( previous_moved, data, "previous_moved", Bool ); N_GETPROP( tile_x, data, "tile_x", Int ); N_GETPROP( tile_y, data, "tile_y", Int );
			N_GETPROP( active, data, "active", Bool );
			const work_state_t work { action, work_units, required_work, last_turn, previous_work_units, previous_movement, previous_moved, tile_x, tile_y };
			if ( !ValidWork( work, unit->m_um->GetMap() ) || ( active && ( work.action.empty() || work.last_turn == 0 ) ) ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Invalid native unit work state" );
			}
			unit->m_work = work;
			unit->SetOrder( active ? order_t::TERRAFORM : order_t::NO_ORDERS );
			unit->m_um->RefreshUnit( GSE_CALL, unit );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"move_to_tile",
		NATIVE_CALL( this ) {

			m_um->m_game->CheckRW( GSE_CALL );

			N_EXPECT_ARGS( 2 );
			N_GETVALUE_UNWRAP( tile, 0, map::tile::Tile );
			N_GET_CALLABLE( on_complete, 1 );
			m_um->Persist( on_complete );
			const auto* errmsg = m_um->MoveUnitToTile( GSE_CALL, this, tile, [ this, on_complete, gc_space, ctx, si, ep ]() {
				auto ep2 = ep;
				on_complete->Run( gc_space, ctx, si, ep2, {} );
				m_um->Unpersist( on_complete );
			});
			if ( errmsg ) {
				GSE_ERROR( gse::EC.GAME_ERROR, *errmsg );
				m_um->Unpersist( on_complete );
				delete errmsg;
			}
			return VALUE( gse::value::Undefined );
		} )
	},
WRAPIMPL_DYNAMIC_SETTERS( Unit )
	WRAPIMPL_SET_PTR( "movement", Float, m_movement )
	WRAPIMPL_SET_PTR( "morale", Float, m_morale )
	WRAPIMPL_SET_PTR( "health", Float, m_health )
	WRAPIMPL_SET_PTR( "moved_this_turn", Bool, m_moved_this_turn )
WRAPIMPL_DYNAMIC_ON_SET( Unit )
	// this is potentially risky because if it gets zero health it will be despawned without script's awareness, how to handle it?
	// maybe despawn unit from within script? but then it would be script's responsibility to ensure there are no zero-health units walking around
	m_um->RefreshUnit( GSE_CALL, this );
WRAPIMPL_DYNAMIC_END()

UNWRAPIMPL_PTR( Unit )

}
}
}
