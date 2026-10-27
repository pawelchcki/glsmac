#include "Faction.h"

#include "types/texture/Texture.h"
#include "gse/value/String.h"
#include "gse/value/Bool.h"
#include "gse/value/Array.h"
#include "gse/value/Int.h"
#include "gse/callable/Native.h"
#include "engine/Engine.h"
#include "loader/texture/TextureLoader.h"
#include "resource/ResourceManager.h"
#include "util/String.h"
#include <set>

namespace game {
namespace backend {
namespace faction {

Faction::Faction() {
	//
}

Faction::Faction( const std::string& id, const std::string& name )
	: m_id( id )
	, m_name( name ) {
	//
}

namespace {
bool ValidIdentity( const Faction::identity_t& identity ) {
	for ( size_t index = 0; index < identity.size(); ++index ) {
		const auto& text = identity[ index ];
		if ( text.size() > ( index == 1 ? 39 : 23 ) ) { return false; }
		for ( const unsigned char character : text ) {
			if ( character < 32 || character == 127 ) { return false; }
		}
	}
	return true;
}
}

std::unique_ptr< Faction > Faction::Clone() const {
	// Wrappable state belongs to each instance. The persistence codec omits
	// flags and base-name pools, so it cannot serve as a complete template copy.
	auto copy = std::make_unique< Faction >( m_id, m_name );
	copy->m_flags = m_flags;
	copy->m_colors = m_colors;
	copy->m_base_names = m_base_names;
	copy->m_bases_render = m_bases_render;
	copy->m_growth = m_growth;
	copy->m_industry = m_industry;
	copy->m_identity = m_identity;
	copy->m_starting_technologies = m_starting_technologies;
	copy->m_economy_bonuses = m_economy_bonuses;
	return copy;
}

Faction::identity_t Faction::ParseIdentity( GSE_CALLABLE, const std::vector< gse::Value* >& values ) {
	identity_t identity;
	if ( values.size() != identity.size() ) { GSE_ERROR( gse::EC.GAME_ERROR, "Faction identity requires six strings" ); }
	for ( size_t index = 0; index < identity.size(); ++index ) {
		const auto* value = values[ index ];
		if ( value->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.GAME_ERROR, "Faction identity fields must be strings" ); }
		identity[ index ] = static_cast< const gse::value::String* >( value )->value;
	}
	if ( !ValidIdentity( identity ) ) { GSE_ERROR( gse::EC.GAME_ERROR, "Invalid faction identity text or length" ); }
	return identity;
}

void Faction::SetIdentity( const identity_t& identity ) {
	if ( !ValidIdentity( identity ) ) { THROW( "Invalid faction identity" ); }
	m_identity = identity;
	m_name = identity[ 1 ];
}

Faction::identity_t Faction::GetIdentity() const {
	auto identity = m_identity;
	identity[ 1 ] = m_name;
	return identity;
}

std::array< int, 2 > Faction::ParseSocialRatings( GSE_CALLABLE, const gse::value::object_properties_t& values ) {
	if ( values.size() != 2 ) { GSE_ERROR( gse::EC.GAME_ERROR, "Faction ratings require exactly growth and industry" ); }
	std::array< int, 2 > ratings;
	size_t index = 0;
	for ( const auto* key : { "growth", "industry" } ) {
		const auto found = values.find( key );
		if ( found == values.end() || found->second->type != gse::VT_INT ) { GSE_ERROR( gse::EC.GAME_ERROR, "Faction ratings must be integers" ); }
		const auto value = static_cast< gse::value::Int* >( found->second )->value;
		if ( value < -8 || value > 10 ) { GSE_ERROR( gse::EC.GAME_ERROR, "Faction rating is outside the verified range" ); }
		ratings[ index++ ] = int( value );
	}
	return ratings;
}

void Faction::SetSocialRatings( const int growth, const int industry ) {
	if ( growth < -8 || growth > 10 || industry < -8 || industry > 10 ) { THROW( "Invalid faction social ratings" ); }
	m_growth = growth;
	m_industry = industry;
}

void Faction::SetStartingTechnologies( const std::vector< std::string >& technologies ) {
	if ( technologies.size() > 128 ) { THROW( "Too many faction starting technologies" ); }
	std::set< std::string > seen;
	for ( const auto& token : technologies ) {
		if ( token.empty() || token.size() > 32 || !seen.insert( token ).second ) { THROW( "Invalid or duplicate faction starting technology" ); }
		for ( const unsigned char character : token ) {
			if ( !( ( character >= 'A' && character <= 'Z' ) || ( character >= 'a' && character <= 'z' ) || ( character >= '0' && character <= '9' ) || character == '_' ) ) { THROW( "Invalid faction starting technology token" ); }
		}
	}
	m_starting_technologies = technologies;
}

std::vector< std::string > Faction::ParseStartingTechnologies( GSE_CALLABLE, const std::vector< gse::Value* >& values ) {
	std::vector< std::string > technologies;
	for ( const auto* value : values ) {
		if ( value->type != gse::VT_STRING ) { GSE_ERROR( gse::EC.INVALID_CALL, "Faction starting technologies must be strings" ); }
		technologies.push_back( static_cast< const gse::value::String* >( value )->value );
	}
	Faction validator;
	try { validator.SetStartingTechnologies( technologies ); }
	catch ( const std::exception& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
	return technologies;
}

void Faction::SetEconomyBonuses( const economy_bonuses_t& bonuses ) {
	if ( bonuses.starting_energy < 0 || bonuses.starting_energy > 1000000 ) { THROW( "Invalid faction starting energy bonus" ); }
	m_economy_bonuses = bonuses;
}

Faction::economy_bonuses_t Faction::ParseEconomyBonuses( GSE_CALLABLE, const gse::value::object_properties_t& values ) {
	if ( values.size() != 2 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Faction economy requires starting energy and Terraform cost flag" ); }
	const auto energy = values.find( "starting_energy" ); const auto terraform = values.find( "terraform_cost_halved" );
	if ( energy == values.end() || terraform == values.end() || energy->second->Deref()->type != gse::VT_INT || terraform->second->Deref()->type != gse::VT_BOOL ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "Invalid faction economy bonus types" );
	}
	const auto amount = static_cast< const gse::value::Int* >( energy->second->Deref() )->value;
	if ( amount < 0 || amount > 1000000 ) { GSE_ERROR( gse::EC.INVALID_CALL, "Invalid faction starting energy bonus" ); }
	return { amount, static_cast< const gse::value::Bool* >( terraform->second->Deref() )->value };
}

const types::Buffer Faction::Serialize() const {
	types::Buffer buf;

	buf.WriteString( m_id );
	buf.WriteString( m_name );

	buf.WriteColor( m_colors.text );
	buf.WriteColor( m_colors.text_shadow );
	buf.WriteColor( m_colors.border );

	buf.WriteString( m_bases_render.file );
	buf.WriteInt( m_bases_render.grid_x );
	buf.WriteInt( m_bases_render.grid_y );
	buf.WriteInt( m_bases_render.cell_width );
	buf.WriteInt( m_bases_render.cell_height );
	buf.WriteInt( m_bases_render.cell_cx );
	buf.WriteInt( m_bases_render.cell_cy );
	buf.WriteInt( m_bases_render.cell_padding );
	buf.WriteFloat( m_bases_render.scale_x );
	buf.WriteFloat( m_bases_render.scale_y );
	for ( size_t index = 0; index < m_identity.size(); ++index ) {
		if ( index != 1 ) { buf.WriteString( m_identity[ index ] ); }
	}
	buf.WriteInt( m_growth );
	buf.WriteInt( m_industry );
	buf.WriteString( "faction-starting-tech-v1" );
	buf.WriteInt( m_starting_technologies.size() );
	for ( const auto& token : m_starting_technologies ) { buf.WriteString( token ); }
	if ( m_economy_bonuses.starting_energy || m_economy_bonuses.terraform_cost_halved ) {
		buf.WriteString( "faction-economy-v1" ); buf.WriteInt( m_economy_bonuses.starting_energy ); buf.WriteBool( m_economy_bonuses.terraform_cost_halved );
	}

	return buf;
}

void Faction::Deserialize( types::Buffer buf ) {

	m_id = buf.ReadString();
	m_name = buf.ReadString();

	buf.ReadColor( m_colors.text );
	buf.ReadColor( m_colors.text_shadow );
	buf.ReadColor( m_colors.border );

	m_bases_render.file = buf.ReadString();
	m_bases_render.grid_x = buf.ReadInt();
	m_bases_render.grid_y = buf.ReadInt();
	m_bases_render.cell_width = buf.ReadInt();
	m_bases_render.cell_height = buf.ReadInt();
	m_bases_render.cell_cx = buf.ReadInt();
	m_bases_render.cell_cy = buf.ReadInt();
	m_bases_render.cell_padding = buf.ReadInt();
	m_bases_render.scale_x = buf.ReadFloat();
	m_bases_render.scale_y = buf.ReadFloat();
	auto identity = GetIdentity();
	for ( size_t index = 0; index < identity.size(); ++index ) {
		if ( index != 1 ) { identity[ index ] = buf.ReadString(); }
	}
	SetIdentity( identity );
	const auto growth = buf.ReadInt();
	const auto industry = buf.ReadInt();
	if ( growth < -8 || growth > 10 || industry < -8 || industry > 10 ) { THROW( "Invalid serialized faction social ratings" ); }
	SetSocialRatings( int( growth ), int( industry ) );
	std::vector< std::string > technologies;
	if ( buf.lenr < buf.lenw ) {
		if ( buf.ReadString() != "faction-starting-tech-v1" ) { THROW( "Unknown faction starting technology extension" ); }
		const auto count = buf.ReadInt();
		if ( count < 0 || count > 128 ) { THROW( "Invalid serialized faction starting technology count" ); }
		for ( int64_t index = 0; index < count; ++index ) { technologies.push_back( buf.ReadString() ); }
	}
	economy_bonuses_t economy;
	if ( buf.lenr < buf.lenw ) {
		if ( buf.ReadString() != "faction-economy-v1" ) { THROW( "Unknown faction economy extension" ); }
		economy.starting_energy = buf.ReadInt(); economy.terraform_cost_halved = buf.ReadBool();
	}
	if ( buf.lenr != buf.lenw ) { THROW( "Trailing faction data" ); }
	SetEconomyBonuses( economy );
	SetStartingTechnologies( technologies );

}

WRAPIMPL_BEGIN( Faction )
	WRAPIMPL_PROPS
			{
				"id",
				VALUE( gse::value::String, , m_id )
			},
			{
				"name",
				VALUE( gse::value::String, , m_name )
			},
			{
				"identity",
				[ & ] () {
					std::vector< gse::Value* > fields;
					for ( const auto& text : GetIdentity() ) { fields.push_back( VALUE( gse::value::String,, text ) ); }
					return VALUE( gse::value::Array,, fields );
				}()
			},
			{
				"social_ratings",
				VALUEEXT( gse::value::Object, GSE_CALL, {
					{ "growth", VALUE( gse::value::Int,, m_growth ) },
					{ "industry", VALUE( gse::value::Int,, m_industry ) },
				} )
			},
			{ "economy_bonuses", VALUEEXT( gse::value::Object, GSE_CALL, {
				{ "starting_energy", VALUE( gse::value::Int,, m_economy_bonuses.starting_energy ) },
				{ "terraform_cost_halved", VALUE( gse::value::Bool,, m_economy_bonuses.terraform_cost_halved ) },
			} ) },
			{ "starting_technologies", [ & ]() {
				std::vector< gse::Value* > tokens;
				for ( const auto& token : m_starting_technologies ) { tokens.push_back( VALUE( gse::value::String,, token ) ); }
				return VALUE( gse::value::Array,, tokens );
			}() },
			{
				"text_color",
				m_colors.text.Wrap( GSE_CALL ),
			},
			{
				"is_naval",
				VALUE( gse::value::Bool, , m_flags & Faction::FF_NAVAL )
			},
			{
				"is_progenitor",
				VALUE( gse::value::Bool, , m_flags & Faction::FF_PROGENITOR )
			},
		};
WRAPIMPL_END_PTR()

UNWRAPIMPL_PTR( Faction )

}
}
}
