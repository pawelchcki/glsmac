#include "Rules.h"

#include "gse/value/Array.h"
#include "gse/value/Int.h"
#include "gse/value/Undefined.h"

namespace game {
namespace backend {
namespace rules {

Rules::Rules( const Rules& other )
	: types::Serializable( other ), gse::Wrappable( other )
	, m_difficulty_levels( other.m_difficulty_levels )
	, m_is_initialized( other.m_is_initialized )
	, m_nutrient_cost_factor( other.m_nutrient_cost_factor ) {}

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
	}
	return *this;
}

Rules::~Rules() { *m_nutrient_handle = nullptr; }

int64_t Rules::GetNutrientCostFactor() const { return m_nutrient_cost_factor; }

void Rules::SetNutrientCostFactor( const int64_t factor ) {
	if ( factor < 1 || factor > 100 ) { THROW( "Nutrient cost multiplier must be an integer from 1 through 100" ); }
	m_nutrient_cost_factor = factor;
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
WRAPIMPL_DYNAMIC_SETTERS( Rules )
WRAPIMPL_DYNAMIC_ON_SET( Rules )
WRAPIMPL_DYNAMIC_END()

const types::Buffer Rules::Serialize() const {
	types::Buffer buf;

	// Difficulty levels remain fixed; this typed extension carries the loaded
	// scalar rather than relying on script custom properties during transfer.
	buf.WriteInt( m_nutrient_cost_factor );

	return buf;
}

void Rules::Deserialize( types::Buffer buf ) {

	// An exact empty legacy rules payload used the previous multiplier ten.
	// A present extension must be complete and valid before any live mutation.
	const auto factor = buf.lenr == buf.lenw ? 10 : buf.ReadInt();
	if ( factor < 1 || factor > 100 || buf.lenr != buf.lenw ) { THROW( "Invalid serialized nutrient cost multiplier" ); }
	SetNutrientCostFactor( factor );
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
