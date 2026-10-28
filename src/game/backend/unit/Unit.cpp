#include "Unit.h"

#include <memory>
#include <cmath>
#include <limits>

#include "gse/context/Context.h"
#include "gse/value/Object.h"
#include "gse/value/Int.h"
#include "gse/value/Float.h"
#include "gse/value/Bool.h"
#include "gse/value/Ptr.h"
#include "gse/callable/Native.h"
#include "game/backend/Game.h"
#include "game/backend/base/Base.h"
#include "game/backend/base/BaseManager.h"
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
	ASSERT( order == order_t::NO_ORDERS || order == order_t::HOLD || order == order_t::SENTRY || ( order == order_t::TERRAFORM && !m_work.action.empty() ) || ( order == order_t::AUTOMATE && !m_automation.command.empty() ), "Invalid native unit order" );
	m_order = order;
}

void Unit::SetTerraformHomeFromProduction( const base::Base* base ) {
	ASSERT( base && base->m_owner == m_owner && m_def->CanTerraform(), "Invalid worker production home" );
	ASSERT( m_um->GetUnit( m_id ) == nullptr && m_terraform_home == 0, "Production home must precede unit publication" );
	m_terraform_home = base->m_id;
}

bool Unit::ValidWork( const work_state_t& work, const map::Map* map ) {
	if ( !work.job.policy.empty() ) {
		const auto& job = work.job;
		if ( !work.height.policy.empty() || work.action.empty() || work.action == "raise" || work.action == "lower" ||
			job.policy != "application.cooperative-work.v1" || job.owner < 0 || job.owner > 7 ||
			job.terrain_identity.empty() || job.terrain_identity.size() > 524288 ) { return false; }
		// The application identity is deterministic ASCII JSON, never an opaque
		// pointer, callback, process generation or arbitrary binary wire blob.
		for ( const unsigned char byte : job.terrain_identity ) { if ( byte < 32 || byte > 126 ) { return false; } }
	}
	if ( !work.height.policy.empty() ) {
		const auto& height = work.height;
		if ( ( work.action != "raise" && work.action != "lower" ) || height.policy != "application.band-slope-height.v1" ||
			height.fee_policy != "application.band-fee.v1" || height.owner < 0 || height.owner > 7 || height.issued_turn <= 0 ||
			height.fee < 1 || height.fee > 25 || height.source_elevation < -3500 || height.source_elevation > 3500 ||
			height.terrain_identity.empty() || height.terrain_identity.size() > 1048576 ) { return false; }
	}
	if ( work.action.empty() ) {
		return work.work_units == 0 && work.required_work == 0 && work.last_turn == 0 && work.previous_work_units == 0 &&
			work.previous_movement == 0.0f && !work.previous_moved && work.tile_x == 0 && work.tile_y == 0;
	}
	static const std::unordered_set< std::string > actions = {
		"farm", "soil_enricher", "mine", "solar", "forest", "road", "mag_tube", "bunker", "airbase", "sensor",
		"remove_fungus", "plant_fungus", "condenser", "mirror", "borehole", "aquifer", "raise", "lower", "level",
	};
	return actions.count( work.action ) &&
		work.required_work >= 2 && work.required_work <= 128 && work.work_units >= 0 && work.work_units < work.required_work &&
		work.last_turn >= 0 && work.previous_work_units >= 0 && work.previous_work_units <= work.work_units &&
		std::isfinite( work.previous_movement ) && work.previous_movement >= 0.0f && work.previous_movement <= 64.0f &&
		work.tile_x >= 0 && work.tile_y >= 0 && static_cast< uint64_t >( work.tile_x ) < map->GetWidth() &&
		static_cast< uint64_t >( work.tile_y ) < map->GetHeight() && work.tile_x % 2 == work.tile_y % 2;
}

bool Unit::ValidAutomation( const automation_state_t& plan, const map::Map* map, const size_t owner ) {
	if ( plan.epoch < 0 ) { return false; }
	if ( plan.command.empty() ) {
		return plan.owner == 0 && plan.issued_turn == 0 && plan.last_turn == 0 && plan.target_x == 0 && plan.target_y == 0 &&
			plan.origin_x == 0 && plan.origin_y == 0 && plan.cursor == 0 && plan.phase == 0;
	}
	static const std::unordered_set< std::string > commands = {
		"farm_solar_road", "farm_mine_road", "road_to", "tube_to", "auto_roads", "auto_tubes",
		"auto_sensors", "auto_remove_fungus", "auto_home_base", "auto_former",
	};
	const auto valid_tile = [map]( const int64_t x, const int64_t y ) {
		return x >= 0 && y >= 0 && static_cast< uint64_t >( x ) < map->GetWidth() &&
			static_cast< uint64_t >( y ) < map->GetHeight() && x % 2 == y % 2;
	};
	return commands.count( plan.command ) && plan.epoch > 0 && plan.owner == static_cast< int64_t >( owner ) &&
		plan.issued_turn > 0 && plan.last_turn >= 0 &&
		plan.cursor >= 0 && plan.cursor <= 1000000 && ( plan.phase == 0 || plan.phase == 1 ) && valid_tile( plan.target_x, plan.target_y ) && valid_tile( plan.origin_x, plan.origin_y );
}

void Unit::CheckLive( GSE_CALLABLE ) const {
	if ( m_um->GetUnit( m_id ) != this ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer belongs to its manager" ); }
}

const std::string& Unit::GetMoraleString() const {
	return m_def->m_moraleset->m_morale_values.at( m_morale ).m_name;
}

void Unit::SetTile( GSE_CALLABLE, map::tile::Tile* tile ) {
	if ( m_tile && m_tile != tile ) {
		// Moving deliberately abandons paid or cooperative location-bound work.
		// No automatic refund or
		// transferable payment token survives; event undo restores full work.
		if ( !m_work.height.policy.empty() || !m_work.job.policy.empty() ) { m_work = {}; SetOrder( m_automation.command.empty() ? order_t::NO_ORDERS : order_t::AUTOMATE ); }
		m_height_recovery = false; m_height_recovery_x = m_height_recovery_y = 0;
	}
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
	if ( !unit->m_work.height.policy.empty() ) {
		const auto& height = unit->m_work.height;
		buf.WriteString( "unit-height-work-v1" ); buf.WriteString( height.policy ); buf.WriteString( height.fee_policy );
		buf.WriteInt( height.owner ); buf.WriteInt( height.issued_turn ); buf.WriteInt( height.fee );
		buf.WriteInt( height.source_elevation ); buf.WriteBool( height.source_water ); buf.WriteString( height.terrain_identity );
	}
	if ( !unit->m_work.job.policy.empty() ) {
		const auto& job = unit->m_work.job;
		buf.WriteString( "unit-cooperative-work-v1" ); buf.WriteString( job.policy );
		buf.WriteInt( job.owner ); buf.WriteString( job.terrain_identity );
	}
	if ( unit->m_height_recovery && !unit->m_tile->is_water_tile && unit->m_height_recovery_x == int64_t( unit->m_tile->coord.x ) && unit->m_height_recovery_y == int64_t( unit->m_tile->coord.y ) ) { buf.WriteString( "unit-height-recovery-v1" ); buf.WriteInt( unit->m_height_recovery_x ); buf.WriteInt( unit->m_height_recovery_y ); }
	if ( unit->m_automation.epoch != 0 ) {
		const auto& plan = unit->m_automation;
		buf.WriteString( "unit-automation-v2" ); buf.WriteString( plan.command );
		buf.WriteInt( plan.epoch ); buf.WriteInt( plan.owner ); buf.WriteInt( plan.issued_turn ); buf.WriteInt( plan.last_turn );
		buf.WriteInt( plan.target_x ); buf.WriteInt( plan.target_y ); buf.WriteInt( plan.origin_x ); buf.WriteInt( plan.origin_y ); buf.WriteInt( plan.cursor ); buf.WriteInt( plan.phase );
	}
	if ( unit->m_terraform_home != 0 ) { buf.WriteString( "unit-terraform-home-v1" ); buf.WriteInt( unit->m_terraform_home ); }
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
	automation_state_t plan;
	int64_t terraform_home = 0, recovery_x = 0, recovery_y = 0; bool recovery = false, seen_height = false, seen_job = false;
	if ( buf.lenr != buf.lenw ) {
		const auto encoded = buf.ReadInt();
		if ( encoded < static_cast< int64_t >( order_t::NO_ORDERS ) || encoded > static_cast< int64_t >( order_t::AUTOMATE ) ) { THROW( "Invalid serialized unit order" ); }
		order = static_cast< order_t >( encoded );
		bool seen_work = false, seen_plan = false, seen_home = false, seen_recovery = false;
		while ( buf.lenr != buf.lenw ) {
			const auto tag = buf.ReadString();
			if ( tag == "unit-work-v1" && !seen_work ) {
				seen_work = true;
				work.action = buf.ReadString(); work.work_units = buf.ReadInt(); work.required_work = buf.ReadInt(); work.last_turn = buf.ReadInt();
				work.previous_work_units = buf.ReadInt(); work.previous_movement = buf.ReadFloat(); work.previous_moved = buf.ReadBool();
				work.tile_x = buf.ReadInt(); work.tile_y = buf.ReadInt();
				if ( work.action.empty() || !ValidWork( work, um->GetMap() ) ) { THROW( "Invalid serialized unit work" ); }
			} else if ( tag == "unit-height-work-v1" && !seen_height ) {
				seen_height = true; auto& height = work.height;
				height.policy = buf.ReadString(); height.fee_policy = buf.ReadString(); height.owner = buf.ReadInt(); height.issued_turn = buf.ReadInt();
				height.fee = buf.ReadInt(); height.source_elevation = buf.ReadInt(); height.source_water = buf.ReadBool(); height.terrain_identity = buf.ReadString();
			} else if ( tag == "unit-cooperative-work-v1" && !seen_job ) {
				seen_job = true; auto& job = work.job;
				job.policy = buf.ReadString(); job.owner = buf.ReadInt(); job.terrain_identity = buf.ReadString();
			} else if ( tag == "unit-height-recovery-v1" && !seen_recovery ) {
				seen_recovery = true; recovery = true; recovery_x = buf.ReadInt(); recovery_y = buf.ReadInt();
			} else if ( ( tag == "unit-automation-v1" || tag == "unit-automation-v2" ) && !seen_plan ) {
				seen_plan = true;
				plan.command = buf.ReadString(); plan.epoch = buf.ReadInt(); plan.owner = buf.ReadInt();
				plan.issued_turn = buf.ReadInt(); plan.last_turn = buf.ReadInt(); plan.target_x = buf.ReadInt(); plan.target_y = buf.ReadInt();
				plan.origin_x = buf.ReadInt(); plan.origin_y = buf.ReadInt(); plan.cursor = buf.ReadInt();
				plan.phase = tag == "unit-automation-v2" ? buf.ReadInt() : ( plan.command.empty() || plan.command == "auto_home_base" ? 0 : 1 );
				if ( plan.epoch == 0 || !ValidAutomation( plan, um->GetMap(), slot->GetIndex() ) ) { THROW( "Invalid serialized automation plan" ); }
			} else if ( tag == "unit-terraform-home-v1" && !seen_home ) {
				seen_home = true; terraform_home = buf.ReadInt();
				if ( terraform_home <= 0 ) { THROW( "Invalid serialized terraforming home" ); }
			} else { THROW( "Unknown or repeated serialized unit extension" ); }
		}
	}
	if ( ( seen_height && work.height.policy.empty() ) || !ValidWork( work, um->GetMap() ) || ( !work.height.policy.empty() && ( !def->CanTerraform() || work.height.owner != int64_t( slot->GetIndex() ) ) ) ) { THROW( "Invalid received paid height work" ); }
	if ( ( seen_job && work.job.policy.empty() ) || ( !work.job.policy.empty() &&
		( !def->CanTerraform() || work.job.owner != int64_t( slot->GetIndex() ) ) ) ) { THROW( "Invalid received cooperative work" ); }
	if ( recovery && ( !def->CanTerraform() || def->GetMovementType() != MT_WATER || tile->is_water_tile || recovery_x != int64_t( pos_x ) || recovery_y != int64_t( pos_y ) ) ) { THROW( "Invalid received height recovery context" ); }
	if ( order == order_t::AUTOMATE && plan.command.empty() ) { THROW( "Missing active automation plan" ); }
	if ( !plan.command.empty() && order != order_t::AUTOMATE && order != order_t::TERRAFORM ) { THROW( "Inactive order with active automation plan" ); }

	if ( order == order_t::TERRAFORM && ( work.action.empty() || work.last_turn == 0 ) ) { THROW( "Missing active unit work" ); }
	auto* unit = new Unit( GSE_CALL, um, id, def.get(), slot, tile, movement, morale, health, moved_this_turn );
	def.release();
	unit->m_work = work;
	unit->m_height_recovery = recovery; unit->m_height_recovery_x = recovery_x; unit->m_height_recovery_y = recovery_y;
	unit->m_automation = plan;
	unit->m_terraform_home = terraform_home;
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
			return VALUE( gse::value::String,, unit->GetOrder() == order_t::AUTOMATE ? "AUTOMATE" : ( unit->GetOrder() == order_t::TERRAFORM ? "TERRAFORM" : ( unit->GetOrder() == order_t::SENTRY ? "SENTRY" : ( unit->GetOrder() == order_t::HOLD ? "HOLD" : "NO_ORDERS" ) ) ) );
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
			if ( !unit->m_automation.command.empty() ) { GSE_ERROR( gse::EC.INVALID_CALL, "Cancel automation before assigning an ordinary order" ); }
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
			gse::value::object_properties_t properties {
				{ "action", VALUE( gse::value::String,, work.action ) },
				{ "work_units", VALUE( gse::value::Int,, work.work_units ) },
				{ "required_work", VALUE( gse::value::Int,, work.required_work ) },
				{ "last_turn", VALUE( gse::value::Int,, work.last_turn ) },
				{ "previous_work_units", VALUE( gse::value::Int,, work.previous_work_units ) },
				{ "previous_movement", VALUE( gse::value::Float,, work.previous_movement ) },
				{ "previous_moved", VALUE( gse::value::Bool,, work.previous_moved ) },
				{ "tile_x", VALUE( gse::value::Int,, work.tile_x ) }, { "tile_y", VALUE( gse::value::Int,, work.tile_y ) },
				{ "active", VALUE( gse::value::Bool,, unit->GetOrder() == order_t::TERRAFORM ) },
			};
			if ( !work.height.policy.empty() ) {
				const auto& height = work.height;
				properties.emplace( "height", VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "version", VALUE( gse::value::Int,, 1 ) }, { "policy", VALUE( gse::value::String,, height.policy ) }, { "fee_policy", VALUE( gse::value::String,, height.fee_policy ) },
					{ "owner", VALUE( gse::value::Int,, height.owner ) }, { "issued_turn", VALUE( gse::value::Int,, height.issued_turn ) }, { "fee", VALUE( gse::value::Int,, height.fee ) },
					{ "source_elevation", VALUE( gse::value::Int,, height.source_elevation ) }, { "source_water", VALUE( gse::value::Bool,, height.source_water ) },
					{ "terrain_identity", VALUE( gse::value::String,, height.terrain_identity ) },
				} ) );
			}
			if ( !work.job.policy.empty() ) {
				const auto& job = work.job;
				properties.emplace( "job", VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "version", VALUE( gse::value::Int,, 1 ) }, { "policy", VALUE( gse::value::String,, job.policy ) },
					{ "owner", VALUE( gse::value::Int,, job.owner ) }, { "terrain_identity", VALUE( gse::value::String,, job.terrain_identity ) },
				} ) );
			}
			return VALUEEXT( gse::value::Object, GSE_CALL, properties );
		} )
	},
	{ "get_terraforming_schema_version", NATIVE_CALL( handle = m_order_handle ) {
		N_EXPECT_ARGS( 0 ); auto* unit = *handle; if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
		unit->CheckLive( GSE_CALL ); return VALUE( gse::value::Int,, 2 );
	} ) },
	{ "get_terraforming_recovery", NATIVE_CALL( handle = m_order_handle ) {
		N_EXPECT_ARGS( 0 ); auto* unit = *handle; if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); } unit->CheckLive( GSE_CALL );
		const bool active = unit->m_height_recovery && !unit->m_tile->is_water_tile && unit->m_height_recovery_x == int64_t( unit->m_tile->coord.x ) && unit->m_height_recovery_y == int64_t( unit->m_tile->coord.y );
		return VALUEEXT( gse::value::Object, GSE_CALL, { { "active", VALUE( gse::value::Bool,, active ) },
			{ "x", VALUE( gse::value::Int,, active ? unit->m_height_recovery_x : 0 ) }, { "y", VALUE( gse::value::Int,, active ? unit->m_height_recovery_y : 0 ) } } );
	} ) },
	{ "set_terraforming_recovery", NATIVE_CALL( handle = m_order_handle ) {
		auto* unit = *handle; if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); } unit->CheckLive( GSE_CALL );
		unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL ); N_EXPECT_ARGS( 1 ); N_GETVALUE( data, 0, Object );
		if ( data.size() != 3 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete height recovery context" ); }
		N_GETPROP( active, data, "active", Bool ); N_GETPROP( x, data, "x", Int ); N_GETPROP( y, data, "y", Int );
		if ( ( active && ( !unit->m_def->CanTerraform() || unit->m_def->GetMovementType() != MT_WATER || unit->GetTile()->is_water_tile || x != int64_t( unit->GetTile()->coord.x ) || y != int64_t( unit->GetTile()->coord.y ) ) ) || ( !active && ( x != 0 || y != 0 ) ) ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid height recovery context" ); }
		unit->m_height_recovery = active; unit->m_height_recovery_x = x; unit->m_height_recovery_y = y;
		return VALUE( gse::value::Undefined );
	} ) },

	{
		"set_terraforming", NATIVE_CALL( handle = m_order_handle ) {
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL );
			N_EXPECT_ARGS( 1 ); N_GETVALUE( data, 0, Object );
			if ( data.size() != 10 + data.count( "height" ) + data.count( "job" ) ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete unit work state" ); }
			N_GETPROP( action, data, "action", String ); N_GETPROP( work_units, data, "work_units", Int );
			N_GETPROP( required_work, data, "required_work", Int ); N_GETPROP( last_turn, data, "last_turn", Int );
			N_GETPROP( previous_work_units, data, "previous_work_units", Int ); N_GETPROP( previous_movement, data, "previous_movement", Float );
			N_GETPROP( previous_moved, data, "previous_moved", Bool ); N_GETPROP( tile_x, data, "tile_x", Int ); N_GETPROP( tile_y, data, "tile_y", Int );
			N_GETPROP( active, data, "active", Bool );
			work_state_t work { action, work_units, required_work, last_turn, previous_work_units, previous_movement, previous_moved, tile_x, tile_y };
			if ( data.count( "height" ) ) {
				N_GETPROP( height_data, data, "height", Object );
				if ( height_data.size() != 9 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete paid height context" ); }
				N_GETPROP( version, height_data, "version", Int ); N_GETPROP( policy, height_data, "policy", String ); N_GETPROP( fee_policy, height_data, "fee_policy", String );
				N_GETPROP( owner, height_data, "owner", Int ); N_GETPROP( issued_turn, height_data, "issued_turn", Int ); N_GETPROP( fee, height_data, "fee", Int );
				N_GETPROP( source_elevation, height_data, "source_elevation", Int ); N_GETPROP( source_water, height_data, "source_water", Bool ); N_GETPROP( terrain_identity, height_data, "terrain_identity", String );
				if ( version != 1 || policy != "application.band-slope-height.v1" || fee_policy != "application.band-fee.v1" || owner != int64_t( unit->m_owner->GetIndex() ) || !unit->m_def->CanTerraform() || issued_turn > int64_t( unit->m_um->m_game->GetTurnId() ) ) { GSE_ERROR( gse::EC.INVALID_CALL, "Paid height context does not belong to this worker" ); }
				work.height = { policy, fee_policy, terrain_identity, owner, issued_turn, fee, source_elevation, source_water };
			}
			if ( data.count( "job" ) ) {
				N_GETPROP( job_data, data, "job", Object );
				if ( job_data.size() != 4 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete cooperative work identity" ); }
				N_GETPROP( version, job_data, "version", Int ); N_GETPROP( policy, job_data, "policy", String );
				N_GETPROP( owner, job_data, "owner", Int ); N_GETPROP( terrain_identity, job_data, "terrain_identity", String );
				if ( version != 1 || policy != "application.cooperative-work.v1" || owner != int64_t( unit->m_owner->GetIndex() ) || !unit->m_def->CanTerraform() ) {
					GSE_ERROR( gse::EC.INVALID_CALL, "Cooperative work identity does not belong to this worker" );
				}
				work.job = { policy, terrain_identity, owner };
			}
			if ( !ValidWork( work, unit->m_um->GetMap() ) || ( active && ( work.action.empty() || work.last_turn == 0 ) ) ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Invalid native unit work state" );
			}
			unit->m_work = work;
			unit->SetOrder( active ? order_t::TERRAFORM : ( unit->m_automation.command.empty() ? order_t::NO_ORDERS : order_t::AUTOMATE ) );
			unit->m_um->RefreshUnit( GSE_CALL, unit );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"get_terraform_home", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 0 ); auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); return VALUE( gse::value::Int,, unit->m_terraform_home );
		} )
	},
	{
		"set_terraform_home", NATIVE_CALL( handle = m_order_handle ) {
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL );
			N_EXPECT_ARGS( 1 ); N_GETVALUE( id, 0, Int );
			if ( id < 0 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid terraforming home identity" ); }
			if ( id > 0 ) {
				auto* bm = unit->m_um->m_game->GetBM();
				auto* base = bm ? bm->GetBase( id ) : nullptr;
				if ( !base || base->m_owner != unit->m_owner ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terraforming home must be a live owned base" ); }
			}
			if ( id == unit->m_terraform_home ) { return VALUE( gse::value::Int,, 0 ); }
			if ( unit->m_home_revision >= std::numeric_limits< int64_t >::max() - 1 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Terraforming home identities exhausted" ); }
			unit->m_home_undo = { ++unit->m_home_revision, unit->m_terraform_home, id };
			unit->m_terraform_home = id;
			return VALUE( gse::value::Int,, unit->m_home_revision );
		} )
	},

	{
		"validate_terraform_home_rollback", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( token, 0, Int ); auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL );
			if ( token <= 0 || token != unit->m_home_undo.token || token != unit->m_home_revision || unit->m_terraform_home != unit->m_home_undo.expected ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Terraforming home receipt is stale" );
			}
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"rollback_terraform_home", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( token, 0, Int ); auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL );
			if ( token <= 0 || token != unit->m_home_undo.token || token != unit->m_home_revision || unit->m_terraform_home != unit->m_home_undo.expected ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Terraforming home receipt is stale" );
			}
			unit->m_terraform_home = unit->m_home_undo.previous; ++unit->m_home_revision; unit->m_home_undo.token = 0;
			return VALUE( gse::value::Undefined );
		} )
	},

	{
		"get_automation", NATIVE_CALL( handle = m_order_handle ) {
			N_EXPECT_ARGS( 0 ); auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); const auto& plan = unit->m_automation;
			return VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "version", VALUE( gse::value::Int,, 2 ) }, { "command", VALUE( gse::value::String,, plan.command ) },
				{ "epoch", VALUE( gse::value::Int,, plan.epoch ) }, { "owner", VALUE( gse::value::Int,, plan.owner ) },
				{ "issued_turn", VALUE( gse::value::Int,, plan.issued_turn ) }, { "last_turn", VALUE( gse::value::Int,, plan.last_turn ) },
				{ "target_x", VALUE( gse::value::Int,, plan.target_x ) }, { "target_y", VALUE( gse::value::Int,, plan.target_y ) },
				{ "origin_x", VALUE( gse::value::Int,, plan.origin_x ) }, { "origin_y", VALUE( gse::value::Int,, plan.origin_y ) },
				{ "cursor", VALUE( gse::value::Int,, plan.cursor ) }, { "phase", VALUE( gse::value::Int,, plan.phase ) },
			} );
		} )
	},
	{
		"set_automation", NATIVE_CALL( handle = m_order_handle ) {
			auto* unit = *handle;
			if ( !unit ) { GSE_ERROR( gse::EC.INVALID_CALL, "Unit no longer exists" ); }
			unit->CheckLive( GSE_CALL ); unit->m_um->m_game->CheckRW( GSE_CALL ); unit->CheckCustomMutation( GSE_CALL );
			N_EXPECT_ARGS( 1 ); N_GETVALUE( data, 0, Object );
			if ( data.size() != 12 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Expected complete automation state" ); }
			N_GETPROP( version, data, "version", Int ); N_GETPROP( command, data, "command", String );
			N_GETPROP( epoch, data, "epoch", Int ); N_GETPROP( owner, data, "owner", Int );
			N_GETPROP( issued_turn, data, "issued_turn", Int ); N_GETPROP( last_turn, data, "last_turn", Int );
			N_GETPROP( target_x, data, "target_x", Int ); N_GETPROP( target_y, data, "target_y", Int );
			N_GETPROP( origin_x, data, "origin_x", Int ); N_GETPROP( origin_y, data, "origin_y", Int ); N_GETPROP( cursor, data, "cursor", Int ); N_GETPROP( phase, data, "phase", Int );
			const automation_state_t plan { command, epoch, owner, issued_turn, last_turn, target_x, target_y, origin_x, origin_y, cursor, phase };
			if ( version != 2 || !ValidAutomation( plan, unit->m_um->GetMap(), unit->m_owner->GetIndex() ) ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "Invalid native automation state" );
			}
			unit->m_automation = plan;
			if ( unit->GetOrder() != order_t::TERRAFORM ) { unit->SetOrder( plan.command.empty() ? order_t::NO_ORDERS : order_t::AUTOMATE ); }
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
