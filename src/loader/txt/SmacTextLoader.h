#pragma once

#include <map>
#include <memory>
#include <mutex>
#include <string>

#include "loader/Loader.h"
#include "gse/Value.h"
#include "SmacText.h"

namespace loader::txt {

using SmacTextDocument = std::shared_ptr< const smac::Document >;

CLASS( SmacTextLoader, Loader )
	// Resolve and read lazily, after the installed resource set is initialized.
	SmacTextDocument Load( const std::string& filename, const std::string& format );

private:
	std::mutex m_mutex;
	std::map< std::pair< std::string, smac::Format >, SmacTextDocument > m_documents;
};

// Both installed-file loading and asset-free tests expose this same wrapper.
// Its callbacks retain an immutable document; every query creates fresh values.
gse::Value* WrapSmacTextDocument( GSE_CALLABLE, SmacTextDocument document );
gse::Value* ParseSmacText( GSE_CALLABLE, const std::string& source, const std::string& format );

}
