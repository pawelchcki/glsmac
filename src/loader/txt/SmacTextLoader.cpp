#include "SmacTextLoader.h"

#include <limits>
#include <optional>
#include <stdexcept>

#include "engine/Engine.h"
#include "resource/ResourceManager.h"
#include "util/FS.h"
#include "gse/Exception.h"
#include "gse/callable/Native.h"
#include "gse/value/Array.h"
#include "gse/value/Bool.h"
#include "gse/value/Int.h"
#include "gse/value/Object.h"
#include "gse/value/String.h"

namespace loader::txt {

SmacTextDocument SmacTextLoader::Load( const std::string& filename, const std::string& format ) {
	const auto parsed_format = smac::parse_format( format );
	if ( filename.empty() ) { throw std::runtime_error( "SMAC text filename cannot be empty" ); }
	const auto* resources = g_engine->GetResourceManager();
	if ( !resources || resources->GetDetectedSMACType() == config::ST_UNKNOWN ) {
		throw std::runtime_error( "SMAC resources have not been initialized" );
	}
	std::lock_guard guard( m_mutex );
	const std::string path = GetCustomFilename( filename );
	const auto key = std::make_pair( path, parsed_format );
	const auto found = m_documents.find( key );
	if ( found != m_documents.end() ) { return found->second; }
	const auto document = std::make_shared< const smac::Document >( smac::parse( util::FS::ReadTextFile( path ), parsed_format ) );
	m_documents.emplace( key, document );
	return document;
}

namespace {

gse::Value* WrapBlock( GSE_CALLABLE, const smac::Block& block ) {
	gse::value::array_elements_t records;
	records.reserve( block.records.size() );
	for ( const auto& record : block.records ) {
		const gse::value::object_properties_t properties {
			{ "kind", VALUE( gse::value::String,, record.kind ) },
			{ "line", VALUE( gse::value::Int,, record.line ) },
			{ "text", VALUE( gse::value::String,, record.text ) },
			{ "name", VALUE( gse::value::String,, record.name ) },
			{ "argument", VALUE( gse::value::String,, record.argument ) },
		};
		records.push_back( VALUE( gse::value::Object,, ctx, si, ep, properties ) );
	}
	const gse::value::object_properties_t properties {
		{ "id", VALUE( gse::value::String,, block.id ) },
		{ "line", VALUE( gse::value::Int,, block.line ) },
		{ "records", VALUE( gse::value::Array,, records ) },
	};
	return VALUE( gse::value::Object,, ctx, si, ep, properties );
}

gse::Value* WrapRows( GSE_CALLABLE, const smac::Rows& rows ) {
	gse::value::array_elements_t result;
	result.reserve( rows.size() );
	for ( const auto& row : rows ) {
		gse::value::array_elements_t fields;
		fields.reserve( row.size() );
		for ( const auto& field : row ) { fields.push_back( VALUE( gse::value::String,, field ) ); }
		result.push_back( VALUE( gse::value::Array,, fields ) );
	}
	return VALUE( gse::value::Array,, result );
}

gse::Value* WrapMenu( GSE_CALLABLE, const smac::Menu& menu ) {
	gse::value::array_elements_t items;
	items.reserve( menu.items.size() );
	for ( const auto& item : menu.items ) {
		const gse::value::object_properties_t properties {
			{ "label", VALUE( gse::value::String,, item.label ) },
			{ "shortcut", VALUE( gse::value::String,, item.shortcut ) },
			{ "separator", VALUE( gse::value::Bool,, item.separator ) },
			{ "line", VALUE( gse::value::Int,, item.line ) },
		};
		items.push_back( VALUE( gse::value::Object,, ctx, si, ep, properties ) );
	}
	const gse::value::object_properties_t properties {
		{ "title", VALUE( gse::value::String,, menu.title ) },
		{ "items", VALUE( gse::value::Array,, items ) },
	};
	return VALUE( gse::value::Object,, ctx, si, ep, properties );
}

std::optional< size_t > ReadOccurrence( GSE_CALLABLE, const gse::value::function_arguments_t& arguments ) {
	if ( arguments.size() == 1 ) { return {}; }
	const auto* value = arguments.at( 1 )->Deref();
	if ( value->type != gse::VT_INT ) { GSE_ERROR( gse::EC.INVALID_CALL, "SMAC block occurrence must be an integer" ); }
	const auto occurrence = ( (const gse::value::Int*)value )->value;
	if ( occurrence < 0 || static_cast< uint64_t >( occurrence ) > std::numeric_limits< size_t >::max() ) {
		GSE_ERROR( gse::EC.INVALID_CALL, "SMAC block occurrence is out of range" );
	}
	return static_cast< size_t >( occurrence );
}

enum class Query { Block, Rows, Menu, Dialog };

gse::Value* MakeQuery( GSE_CALLABLE, SmacTextDocument document, const Query query ) {
	return NATIVE_CALL( document, query ) {
		N_EXPECT_ARGS_MIN_MAX( 1, 2 ); N_GETVALUE( id, 0, String );
		const auto occurrence = ReadOccurrence( GSE_CALL, arguments );
		try {
			switch ( query ) {
				case Query::Rows:
					return WrapRows( GSE_CALL, occurrence.has_value() ? document->rows( id, *occurrence ) : document->rows( id ) );
				case Query::Menu:
					return WrapMenu( GSE_CALL, occurrence.has_value() ? document->menu( id, *occurrence ) : document->menu( id ) );
				case Query::Dialog:
					return WrapBlock( GSE_CALL, occurrence.has_value() ? document->dialog( id, *occurrence ) : document->dialog( id ) );
				case Query::Block:
					return WrapBlock( GSE_CALL, occurrence.has_value() ? document->block( id, *occurrence ) : document->block( id ) );
			}
		}
		catch ( const std::exception& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
		GSE_ERROR( gse::EC.INVALID_CALL, "Unknown SMAC text query" );
	} );
}

}

gse::Value* WrapSmacTextDocument( GSE_CALLABLE, SmacTextDocument document ) {
	const gse::value::object_properties_t properties {
		{ "ids", NATIVE_CALL( document ) {
			N_EXPECT_ARGS( 0 );
			gse::value::array_elements_t ids;
			for ( const auto& id : document->ids() ) { ids.push_back( VALUE( gse::value::String,, id ) ); }
			return VALUE( gse::value::Array,, ids );
		} ) },
		{ "block", MakeQuery( GSE_CALL, document, Query::Block ) },
		{ "rows", MakeQuery( GSE_CALL, document, Query::Rows ) },
		{ "menu", MakeQuery( GSE_CALL, document, Query::Menu ) },
		{ "dialog", MakeQuery( GSE_CALL, document, Query::Dialog ) },
	};
	return VALUE( gse::value::Object,, ctx, si, ep, properties );
}

gse::Value* ParseSmacText( GSE_CALLABLE, const std::string& source, const std::string& format ) {
	try {
		return WrapSmacTextDocument( GSE_CALL, std::make_shared< const smac::Document >( smac::parse( source, format ) ) );
	}
	catch ( const std::exception& error ) { GSE_ERROR( gse::EC.INVALID_CALL, error.what() ); }
}

}
