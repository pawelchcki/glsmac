#include "Rules.h"

#include "gse/value/Array.h"
#include "gse/value/Int.h"
#include "gse/value/Undefined.h"
#include "gse/value/String.h"
#include "game/backend/settings/Settings.h"

namespace game {
namespace backend {
namespace rules {

Rules::Rules( const Rules& other )
	: types::Serializable( other ), gse::Wrappable( other )
	, m_difficulty_levels( other.m_difficulty_levels )
	, m_is_initialized( other.m_is_initialized )
	, m_nutrient_cost_factor( other.m_nutrient_cost_factor )
	, m_mineral_cost_factor( other.m_mineral_cost_factor )
	, m_world_sizes( other.m_world_sizes )
	, m_has_world_sizes( other.m_has_world_sizes ) {}

Rules& Rules::operator=( const Rules& other ) {
	if ( this != &other ) {
		// wrapmap_t is immutable and previously made implicit assignment
		// unavailable. This bounded assignment supports the fixed definition
		// only; reject a differing map before changing any destination state.
		if ( m_difficulty_levels.GetVK() != other.m_difficulty_levels.GetVK() ||
			m_difficulty_levels.GetKV() != other.m_difficulty_levels.GetKV() ) {
			THROW( "Cannot assign rules with different fixed difficulty definitions" );
		}
		m_is_initialized = other.m_is_initialized;
		m_nutrient_cost_factor = other.m_nutrient_cost_factor;
		m_mineral_cost_factor = other.m_mineral_cost_factor;
		m_world_sizes = other.m_world_sizes;
		m_has_world_sizes = other.m_has_world_sizes;
	}
	return *this;
}

Rules::~Rules() { *m_nutrient_handle = nullptr; }

int64_t Rules::GetNutrientCostFactor() const { return m_nutrient_cost_factor; }

void Rules::SetNutrientCostFactor( const int64_t factor ) {
	if ( factor < 1 || factor > 100 ) { THROW( "Nutrient cost multiplier must be an integer from 1 through 100" ); }
	m_nutrient_cost_factor = factor;
}

int64_t Rules::GetMineralCostFactor() const { return m_mineral_cost_factor; }

void Rules::SetMineralCostFactor( const int64_t factor ) {
	if ( factor < 1 || factor > 100 ) { THROW( "Mineral cost multiplier must be an integer from 1 through 100" ); }
	m_mineral_cost_factor = factor;
}

const Rules::world_sizes_t& Rules::GetWorldSizes() const { return m_world_sizes; }
bool Rules::HasWorldSizes() const { return m_has_world_sizes; }

const Rules::world_sizes_t& Rules::LegacyWorldSizes() {
	static const world_sizes_t sizes = {
		{ "Tiny Planet", "", 68, 34 }, { "Small Planet", "", 88, 44 },
		{ "Standard Planet", "", 112, 56 }, { "Large Planet", "", 140, 70 },
		{ "Huge Planet", "", 180, 90 },
	};
	return sizes;
}

void Rules::ValidateWorldSizes( const world_sizes_t& sizes ) {
	if ( sizes.size() != 5 ) { THROW( "World-size table requires five ordered presets" ); }
	for ( const auto& size : sizes ) {
		if ( size.name.find_first_not_of( " \t\r\n" ) == std::string::npos || size.name.find_first_of( "|\r\n" ) != std::string::npos ||
			size.description.find_first_of( "|\r\n" ) != std::string::npos ||
			size.size_x < 4 || size.size_x > 4096 || size.size_x % 2 ||
			size.size_y < 2 || size.size_y > 4096 || size.size_y % 2 ) {
			THROW( "Invalid world-size preset" );
		}
	}
}

void Rules::SetWorldSizes( const world_sizes_t& sizes ) {
	ValidateWorldSizes( sizes );
	m_world_sizes = sizes;
	m_has_world_sizes = true;
}

Rules::world_sizes_t Rules::DecodeWorldSizes( GSE_CALLABLE, gse::Value* value ) {
	value = value ? value->Deref() : nullptr;
	if ( !value || value->type != gse::VT_ARRAY ) { GSE_ERROR( gse::EC.INVALID_CALL, "World sizes must be an array" ); }
	const auto& entries = static_cast< gse::value::Array* >( value )->value;
	if ( entries.size() != 5 ) { GSE_ERROR( gse::EC.INVALID_CALL, "World sizes require five ordered presets" ); }
	world_sizes_t result;
	for ( size_t level = 0; level < entries.size(); ++level ) {
		auto* entry = entries[level]->Deref();
		if ( entry->type != gse::VT_OBJECT ) { GSE_ERROR( gse::EC.INVALID_CALL, "World-size entry must be an object" ); }
		auto* object = static_cast< gse::value::Object* >( entry );
		if ( object->value.size() != 5 ) { GSE_ERROR( gse::EC.INVALID_CALL, "World-size entry requires level, name, description, size_x and size_y" ); }
		auto* index = object->Get( "level" )->Deref();
		auto* name = object->Get( "name" )->Deref(); auto* description = object->Get( "description" )->Deref();
		auto* width = object->Get( "size_x" )->Deref(); auto* height = object->Get( "size_y" )->Deref();
		if ( index->type != gse::VT_INT || static_cast< gse::value::Int* >( index )->value != static_cast< int64_t >( level ) ||
			name->type != gse::VT_STRING || description->type != gse::VT_STRING || width->type != gse::VT_INT || height->type != gse::VT_INT ) {
			GSE_ERROR( gse::EC.INVALID_CALL, "World-size entry has invalid fields or ordinal" );
		}
		result.push_back( { static_cast< gse::value::String* >( name )->value, static_cast< gse::value::String* >( description )->value,
			static_cast< gse::value::Int* >( width )->value, static_cast< gse::value::Int* >( height )->value } );
	}
	try { ValidateWorldSizes( result ); }
	catch ( const std::runtime_error& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
	return result;
}

gse::Value* Rules::WrapWorldSizes( GSE_CALLABLE ) const {
	gse::value::array_elements_t result;
	for ( size_t level = 0; level < m_world_sizes.size(); ++level ) {
		const auto& size = m_world_sizes[level];
		result.push_back( VALUEEXT( gse::value::Object, GSE_CALL, {
			{ "level", VALUE( gse::value::Int,, level ) }, { "name", VALUE( gse::value::String,, size.name ) },
			{ "description", VALUE( gse::value::String,, size.description ) },
			{ "size_x", VALUE( gse::value::Int,, size.size_x ) }, { "size_y", VALUE( gse::value::Int,, size.size_y ) },
		} ) );
	}
	return VALUE( gse::value::Array,, result );
}

const int Rules::GetDefaultDifficultyLevelV() const {
	return m_difficulty_levels.GetValueUnsafe( GetDefaultDifficultyLevel() );
}

void Rules::Initialize() {
	if ( !m_is_initialized ) {
		InitRules();
		m_is_initialized = true;
	}
}

WRAPIMPL_DYNAMIC_GETTERS( Rules )
			WRAPIMPL_GET_CUSTOM( "difficulty_levels", Array, WrapDifficultyLevels( gc_space ) )
	{
		"get_nutrient_cost_factor", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 0 );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			return VALUE( gse::value::Int,, rules->GetNutrientCostFactor() );
		} )
	},
	{
		"set_nutrient_cost_factor", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( factor, 0, Int );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			CheckCustomMutation( GSE_CALL );
			if ( factor < 1 || factor > 100 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Nutrient cost multiplier must be from 1 through 100" ); }
			rules->SetNutrientCostFactor( factor );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"get_mineral_cost_factor", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 0 );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			return VALUE( gse::value::Int,, rules->GetMineralCostFactor() );
		} )
	},
	{
		"set_mineral_cost_factor", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 1 ); N_GETVALUE( factor, 0, Int );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			CheckCustomMutation( GSE_CALL );
			if ( factor < 1 || factor > 100 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Mineral cost multiplier must be from 1 through 100" ); }
			rules->SetMineralCostFactor( factor );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"get_world_sizes", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 0 );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			return rules->WrapWorldSizes( GSE_CALL );
		} )
	},
	{
		"set_world_sizes", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 1 );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			CheckCustomMutation( GSE_CALL );
			rules->SetWorldSizes( DecodeWorldSizes( GSE_CALL, arguments[0] ) );
			return VALUE( gse::value::Undefined );
		} )
	},
	{
		"select_world_size", NATIVE_CALL( handle = m_nutrient_handle ) {
			N_EXPECT_ARGS( 2 );
			auto* rules = *handle;
			if ( !rules ) { GSE_ERROR( gse::EC.INVALID_CALL, "Rules no longer exist" ); }
			N_GETVALUE_UNWRAP( map, 0, settings::MapSettings ); N_GETVALUE( level, 1, Int );
			CheckCustomMutation( GSE_CALL );
			if ( level < 0 || level >= static_cast< int64_t >( rules->m_world_sizes.size() ) ) {
				GSE_ERROR( gse::EC.INVALID_CALL, "World-size level must be from 0 through 4" );
			}
			const auto& size = rules->m_world_sizes[level];
			try { map->SelectWorldSize( size.size_x, size.size_y, level ); }
			catch ( const std::runtime_error& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
			return VALUE( gse::value::Undefined );
		} )
	},
WRAPIMPL_DYNAMIC_SETTERS( Rules )
WRAPIMPL_DYNAMIC_ON_SET( Rules )
WRAPIMPL_DYNAMIC_END()

const types::Buffer Rules::Serialize() const {
	types::Buffer buf;

	// Difficulty levels remain fixed; this typed extension carries the loaded
	// multipliers rather than relying on script custom properties during transfer.
	buf.WriteInt( m_nutrient_cost_factor );
	buf.WriteInt( m_mineral_cost_factor );
	if ( m_has_world_sizes ) {
		buf.WriteString( "world-sizes-v1" );
		buf.WriteInt( m_world_sizes.size() );
		for ( const auto& size : m_world_sizes ) {
			buf.WriteString( size.name ); buf.WriteString( size.description );
			buf.WriteInt( size.size_x ); buf.WriteInt( size.size_y );
		}
	}

	return buf;
}

void Rules::Deserialize( types::Buffer buf ) {

	// Exact empty legacy records default both fields. Exact nutrient-only
	// records retain that value and default mineral; a present second field
	// must be complete and valid before either live value changes.
	const auto nutrient = buf.lenr == buf.lenw ? 10 : buf.ReadInt();
	const auto mineral = buf.lenr == buf.lenw ? 10 : buf.ReadInt();
	auto sizes = LegacyWorldSizes();
	const bool loaded_sizes = buf.lenr != buf.lenw;
	if ( loaded_sizes ) {
		if ( buf.ReadString() != "world-sizes-v1" || buf.ReadInt() != 5 ) { THROW( "Invalid serialized world-size table header" ); }
		sizes.clear();
		for ( size_t level = 0; level < 5; ++level ) {
			const auto name = buf.ReadString(); const auto description = buf.ReadString();
			const auto width = buf.ReadInt(); const auto height = buf.ReadInt();
			sizes.push_back( { name, description, width, height } );
		}
		ValidateWorldSizes( sizes );
	}
	if ( nutrient < 1 || nutrient > 100 || mineral < 1 || mineral > 100 || buf.lenr != buf.lenw ) { THROW( "Invalid serialized rules record" ); }
	SetNutrientCostFactor( nutrient );
	SetMineralCostFactor( mineral );
	m_world_sizes = std::move( sizes );
	m_has_world_sizes = loaded_sizes;
	m_is_initialized = true;

}

const gse::value::array_elements_t Rules::WrapDifficultyLevels( gc::Space* const gc_space ) {
	gse::value::array_elements_t result = {};
	const auto& vk = m_difficulty_levels.GetVK();
	std::map< int, std::string > kv = {};
	for ( const auto& it : vk ) {
		kv.insert( { it.first, it.second } );
	}
	result.reserve( kv.size() );
	for ( const auto& it : kv ) {
		result.push_back( VALUE( gse::value::String, , it.second ) ); // TODO: full object?
	}
	return result;
}

}
}
}
