#include "Settings.h"

#include "util/FS.h"

#include "gse/value/Float.h"
#include "gse/value/Ptr.h"
#include "gse/context/ChildContext.h"
#include "gse/GSE.h"
#include "gse/ExecutionPointer.h"
#include "gc/Space.h"

namespace game {
namespace backend {
namespace settings {

WRAPMAP( type, MapSettings::type_t,
	{ MapSettings::MT_RANDOM, "random" },
	{ MapSettings::MT_CUSTOM, "custom" },
	{ MapSettings::MT_MAPFILE, "mapfile" },
	{ MapSettings::MT_PLANET, "planet" },
	{ MapSettings::MT_HUGE_PLANET, "huge_planet" },
)

WRAPIMPL_DYNAMIC_GETTERS( MapSettings )
			WRAPIMPL_GET_MAPPED( type )
			WRAPIMPL_GET_PTR( "filename", filename )
			WRAPIMPL_GET_PTR( "size_x", size_x )
			WRAPIMPL_GET_PTR( "size_y", size_y )
			WRAPIMPL_GET_PTR( "preset_level", preset_level )
			WRAPIMPL_GET_PTR( "ocean_coverage", ocean_coverage )
			WRAPIMPL_GET_PTR( "erosive_forces", erosive_forces )
			WRAPIMPL_GET_PTR( "native_lifeforms", native_lifeforms )
			WRAPIMPL_GET_PTR( "cloud_cover", cloud_cover )
WRAPIMPL_DYNAMIC_SETTERS( MapSettings )
	if ( key == "preset_level" ) {
		if ( value->type != gse::VT_INT || ( (gse::value::Int*)value )->value < -1 || ( (gse::value::Int*)value )->value > 4 ) {
			GSE_ERROR( gse::EC.INVALID_ASSIGNMENT, "Map preset level must be -1 or an integer from 0 through 4" );
		}
		const auto requested = ( (gse::value::Int*)value )->value;
		if ( requested != -1 && obj->type != MapSettings::MT_RANDOM && obj->type != MapSettings::MT_CUSTOM ) {
			GSE_ERROR( gse::EC.INVALID_ASSIGNMENT, "Imported maps cannot declare named preset provenance" );
		}
		obj->preset_level = requested;
		obj->RefreshPresetWrappers();
		return;
	}
	WRAPIMPL_SET_MAPPED( type )
	WRAPIMPL_SET_PTR( "filename", String, filename )
	WRAPIMPL_SET_PTR( "size_x", Int, size_x )
	WRAPIMPL_SET_PTR( "size_y", Int, size_y )
	WRAPIMPL_SET_PTR( "ocean_coverage", Float, ocean_coverage )
	WRAPIMPL_SET_PTR( "erosive_forces", Float, erosive_forces )
	WRAPIMPL_SET_PTR( "native_lifeforms", Float, native_lifeforms )
	WRAPIMPL_SET_PTR( "cloud_cover", Float, cloud_cover )
WRAPIMPL_DYNAMIC_ON_SET( MapSettings )
	if ( property_name == "size_x" || property_name == "size_y" ||
		( property_name == "type" && type != MT_RANDOM && type != MT_CUSTOM ) ) {
		preset_level = -1;
	}
	if ( property_name == "size_x" || property_name == "size_y" || property_name == "type" ) {
		RefreshWrappers();
	}
WRAPIMPL_DYNAMIC_END()

UNWRAPIMPL_PTR( MapSettings )

void MapSettings::RefreshPresetWrappers() {
	// Dynamic assignment caches a scalar in the assigning wrapper. Restore the
	// native pointer on all retained wrappers when another field or a native
	// decode changes provenance; each value belongs to its wrapper's GC space.
	for ( auto* wrapper : m_wrapobjs ) {
		auto* space = wrapper->GetContext()->GetGSE()->GetGCSpace();
		if ( !space->IsOwnerThread() || !space->IsAccumulating() ) { THROW( "Live map settings require the owning GSE accumulation context" ); }
		space->Accumulate( wrapper, [ this, wrapper, space ]() {
			wrapper->Assign( "preset_level", new gse::value::Ptr< int64_t >( space, preset_level ) );
		}, nullptr, true );
	}
}

void MapSettings::RefreshWrappers() {
	// Assignment and native transfer can replace values whose assigning wrappers
	// cached scalars. Restore each exposed value in its own context.
	for ( auto* wrapper : m_wrapobjs ) {
		auto* space = wrapper->GetContext()->GetGSE()->GetGCSpace();
		if ( !space->IsOwnerThread() || !space->IsAccumulating() ) { THROW( "Live map settings require the owning GSE accumulation context" ); }
		space->Accumulate( wrapper, [ this, wrapper, space ]() {
			gse::ExecutionPointer ep;
			wrapper->Assign( "type", __wrap_type.Get( space, wrapper->GetContext(), {}, ep, type ) );
			wrapper->Assign( "filename", new gse::value::Ptr< std::string >( space, filename ) );
			wrapper->Assign( "size_x", new gse::value::Ptr< int64_t >( space, size_x ) );
			wrapper->Assign( "size_y", new gse::value::Ptr< int64_t >( space, size_y ) );
			wrapper->Assign( "preset_level", new gse::value::Ptr< int64_t >( space, preset_level ) );
			wrapper->Assign( "ocean_coverage", new gse::value::Ptr< float >( space, ocean_coverage ) );
			wrapper->Assign( "erosive_forces", new gse::value::Ptr< float >( space, erosive_forces ) );
			wrapper->Assign( "native_lifeforms", new gse::value::Ptr< float >( space, native_lifeforms ) );
			wrapper->Assign( "cloud_cover", new gse::value::Ptr< float >( space, cloud_cover ) );
		}, nullptr, true );
	}
}

void MapSettings::SelectWorldSize( const int64_t width, const int64_t height, const int64_t level ) {
	if ( ( type != MT_RANDOM && type != MT_CUSTOM ) || level < 0 || level > 4 ||
		width < 4 || width > 4096 || width % 2 || height < 2 || height > 4096 || height % 2 ) {
		THROW( "Invalid named world size or imported map context" );
	}
	size_x = width; size_y = height; preset_level = level;
	RefreshWrappers();
}

const types::Buffer MapSettings::Serialize() const {
	types::Buffer buf;

	buf.WriteInt( type );
	buf.WriteString( util::FS::GetBaseName( filename ) ); // don't send full path for security reasons, nobody needs it anyway
	buf.WriteInt( size_x );
	buf.WriteInt( size_y );
	buf.WriteFloat( ocean_coverage );
	buf.WriteFloat( erosive_forces );
	buf.WriteFloat( native_lifeforms );
	buf.WriteFloat( cloud_cover );
	buf.WriteInt( preset_level );

	return buf;
}

void MapSettings::Deserialize( types::Buffer buf ) {
	const auto decoded_type = buf.ReadInt();
	if ( decoded_type < MT_RANDOM || decoded_type > MT_HUGE_PLANET ) { THROW( "invalid map settings type" ); }
	const auto decoded_filename = buf.ReadString();
	const auto decoded_size_x = buf.ReadInt(); const auto decoded_size_y = buf.ReadInt();
	const auto decoded_ocean = buf.ReadFloat(); const auto decoded_erosive = buf.ReadFloat();
	const auto decoded_lifeforms = buf.ReadFloat(); const auto decoded_cloud = buf.ReadFloat();
	// Older settings lack provenance and remain explicitly unknown. Validate
	// the complete record before replacing any live settings.
	auto decoded_preset = buf.lenr == buf.lenw ? -1 : buf.ReadInt();
	if ( decoded_preset < -1 || decoded_preset > 4 || buf.lenr != buf.lenw ) { THROW( "invalid map preset provenance" ); }
	if ( decoded_type != MT_RANDOM && decoded_type != MT_CUSTOM ) { decoded_preset = -1; }
	type = (type_t)decoded_type; filename = decoded_filename;
	size_x = decoded_size_x; size_y = decoded_size_y;
	ocean_coverage = decoded_ocean; erosive_forces = decoded_erosive;
	native_lifeforms = decoded_lifeforms; cloud_cover = decoded_cloud;
	preset_level = decoded_preset;
	RefreshWrappers();
}

void GlobalSettings::Initialize() {
	rules.Initialize();
	difficulty_level = rules.GetDefaultDifficultyLevelV();
}

WRAPIMPL_DYNAMIC_GETTERS( GlobalSettings )
			WRAPIMPL_GET_WRAPPED( map )
			WRAPIMPL_GET_WRAPPED( rules )
			WRAPIMPL_GET_MAPPED_CUSTOM( difficulty_level, rules.m_difficulty_levels )
			WRAPIMPL_GET_PTR( "game_name", game_name )
WRAPIMPL_DYNAMIC_SETTERS( GlobalSettings )
	WRAPIMPL_SET_PTR( "game_name", String, game_name )
	WRAPIMPL_SET_MAPPED_CUSTOM( difficulty_level, obj->rules.m_difficulty_levels )
WRAPIMPL_DYNAMIC_ON_SET( GlobalSettings )
WRAPIMPL_DYNAMIC_END()

const types::Buffer GlobalSettings::Serialize() const {
	types::Buffer buf;

	buf.WriteString( map.Serialize().ToString() );
	buf.WriteString( rules.Serialize().ToString() );
	buf.WriteInt( difficulty_level );
	buf.WriteString( game_name );

	return buf;
}

void GlobalSettings::Deserialize( types::Buffer buf ) {
	// A rejected aggregate must not leave an earlier map or Rules field live.
	// Parse every field and validate both nested records before committing any
	// destination state. Temporary Wrappables have no receiving-world aliases.
	const auto map_bytes = buf.ReadString();
	const auto rules_bytes = buf.ReadString();
	const auto decoded_difficulty = buf.ReadInt();
	const auto decoded_name = buf.ReadString();
	MapSettings decoded_map;
	decoded_map.Deserialize( types::Buffer( map_bytes ) );
	::game::backend::rules::Default decoded_rules;
	decoded_rules.Deserialize( types::Buffer( rules_bytes ) );
	// Wire integers are wider than the fixed difficulty map's keys. Compare
	// before narrowing so an out-of-range value cannot alias a registered key.
	bool registered_difficulty = false;
	for ( const auto& entry : decoded_rules.m_difficulty_levels.GetVK() ) {
		if ( decoded_difficulty == static_cast< int64_t >( entry.first ) ) {
			registered_difficulty = true;
			break;
		}
	}
	if ( !registered_difficulty ) { THROW( "Invalid serialized difficulty level" ); }

	// Keep the actual destination objects: map decode refreshes retained preset
	// wrappers, and Rules assignment preserves its saved native-reader handle.
	map.Deserialize( types::Buffer( map_bytes ) );
	rules = decoded_rules;
	difficulty_level = decoded_difficulty;
	game_name = decoded_name;
	RefreshWrappers();
}

void GlobalSettings::RefreshWrappers() {
	// Script assignment caches scalar values. Successful native transfer must
	// restore both exposed global values using the receiver's existing rules.
	for ( auto* wrapper : m_wrapobjs ) {
		auto* space = wrapper->GetContext()->GetGSE()->GetGCSpace();
		if ( !space->IsOwnerThread() || !space->IsAccumulating() ) { THROW( "Live global settings require the owning GSE accumulation context" ); }
		space->Accumulate( wrapper, [ this, wrapper, space ]() {
			gse::ExecutionPointer ep;
			wrapper->Assign( "difficulty_level", rules.m_difficulty_levels.Get( space, wrapper->GetContext(), {}, ep, difficulty_level ) );
			wrapper->Assign( "game_name", new gse::value::Ptr< std::string >( space, game_name ) );
		}, nullptr, true );
	}
}

WRAPMAP( game_mode, LocalSettings::game_mode_t,
	{ LocalSettings::GM_SINGLEPLAYER, "single" },
	{ LocalSettings::GM_MULTIPLAYER, "multi" },
	{ LocalSettings::GM_SCENARIO, "scenario" },
)

WRAPMAP( network_type, LocalSettings::network_type_t,
	{ LocalSettings::NT_NONE, "none" },
	{ LocalSettings::NT_SIMPLE_TCPIP, "simple_tcpip" },
	{ LocalSettings::NT_HOTSEAT, "hotseat" },
)

WRAPMAP( network_role, LocalSettings::network_role_t,
	{ LocalSettings::NR_NONE, "none" },
	{ LocalSettings::NR_CLIENT, "client" },
	{ LocalSettings::NR_SERVER, "server" },
)

WRAPIMPL_DYNAMIC_GETTERS( LocalSettings )
			{
				"account",
				account.Wrap( GSE_CALL ),
			},
			WRAPIMPL_GET_MAPPED( game_mode )
			WRAPIMPL_GET_MAPPED( network_type )
			WRAPIMPL_GET_MAPPED( network_role )
			WRAPIMPL_GET_PTR( "player_name", player_name )
			WRAPIMPL_GET_PTR( "remote_address", remote_address )
WRAPIMPL_DYNAMIC_SETTERS( LocalSettings )
	WRAPIMPL_SET_MAPPED( game_mode )
	WRAPIMPL_SET_MAPPED( network_type )
	WRAPIMPL_SET_MAPPED( network_role )
	WRAPIMPL_SET_PTR( "player_name", String, player_name )
	WRAPIMPL_SET_PTR( "remote_address", String, remote_address )
WRAPIMPL_DYNAMIC_ON_SET( LocalSettings )
WRAPIMPL_DYNAMIC_END()

const types::Buffer LocalSettings::Serialize() const {
	types::Buffer buf;

	buf.WriteInt( game_mode );
	buf.WriteInt( network_type );
	buf.WriteInt( network_role );
	buf.WriteString( player_name );
	buf.WriteString( remote_address );

	return buf;
}

void LocalSettings::Deserialize( types::Buffer buf ) {
	game_mode = (game_mode_t)buf.ReadInt();
	network_type = (network_type_t)buf.ReadInt();
	network_role = (network_role_t)buf.ReadInt();
	player_name = buf.ReadString();
	remote_address = buf.ReadString();
}

WRAPIMPL_BEGIN( Settings )
	WRAPIMPL_PROPS
			{
				"global",
				global.Wrap( GSE_CALL ),
			},
			{
				"local",
				local.Wrap( GSE_CALL ),
			},
		};
WRAPIMPL_END_PTR()

const types::Buffer Settings::Serialize() const {
	types::Buffer buf;

	buf.WriteString( global.Serialize().ToString() );
	buf.WriteString( local.Serialize().ToString() );

	return buf;
}

void Settings::Deserialize( types::Buffer buf ) {
	global.Deserialize( types::Buffer( buf.ReadString() ) );
	local.Deserialize( types::Buffer( buf.ReadString() ) );
}

}
}
}
