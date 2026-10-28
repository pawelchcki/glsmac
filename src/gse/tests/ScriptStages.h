#pragma once

#include <memory>
#include <string>

namespace task::gsetests { class GSETests; }
namespace gse {
class GSE;
namespace context { class GlobalContext; }
namespace tests {

// Optional script-test driver. No production GSE/Async/GC cadence is changed.
class ScriptStages {
public:
 static std::unique_ptr< ScriptStages > Install( GSE* gse, context::GlobalContext* context );
 ~ScriptStages();
 ScriptStages( const ScriptStages& ) = delete;
 ScriptStages& operator=( const ScriptStages& ) = delete;
 bool Enabled() const;
 std::string RunAndFinish( const std::string& initial_error = {} );
private:
 struct State;
 explicit ScriptStages( std::shared_ptr< State > state );
 std::shared_ptr< State > m_state;
};

void AddScriptStageTests( task::gsetests::GSETests* task );
}
}
