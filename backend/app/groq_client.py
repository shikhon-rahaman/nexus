"""
Thin wrapper around the Groq API for structured tool selection.

Design rule: the LLM's ONLY output is a tool_name + arguments dict (or a
final diagnosis narration). It never produces a shell string, and its
output is always parsed into our Pydantic schemas before anything downstream
trusts it. If the LLM's output doesn't validate, we treat it as a failure,
not as something to "clean up" and pass through anyway.
"""
from __future__ import annotations
import json
import os
from groq import Groq

client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

MODEL = "openai/gpt-oss-120b"

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_memory",
            "description": "Get current RAM and swap usage",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cpu",
            "description": "Get current CPU load average",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_disk",
            "description": "Get disk usage for the root filesystem",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_processes",
            "description": "List top memory-consuming processes",
            "parameters": {"type": "object", "properties": {
                "top_n": {"type": "integer", "description": "Number of processes to return"}
            }},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "service_status",
            "description": "Check whether a specific service is active",
            "parameters": {"type": "object", "properties": {
                "service_name": {"type": "string", "enum": ["nginx", "sshd", "docker", "python-worker"]}
            }, "required": ["service_name"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_nginx_config",
            "description": "Check if the nginx configuration file has valid syntax; use this when nginx is running but may still be serving an incorrect configuration after a bad reload.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_logs",
            "description": "Read recent logs for a service unit",
            "parameters": {"type": "object", "properties": {
                "unit": {"type": "string", "enum": ["nginx", "sshd", "docker", "python-worker"]},
                "lines": {"type": "integer"},
            }, "required": ["unit"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "restart_service",
            "description": "Restart a service. Requires user approval before execution.",
            "parameters": {"type": "object", "properties": {
                "service_name": {"type": "string", "enum": ["nginx", "sshd", "docker", "python-worker"]}
            }, "required": ["service_name"]},
        },
    },
]

SYSTEM_PROMPT = """You are the reasoning layer of NEXUS, a Linux operations
assistant. You select tools to investigate the user's system and narrate
findings in plain language. You NEVER invent metrics — every number you
state must come from a tool result you were given. You NEVER propose a
shell command directly; you only call the provided tools. If asked to do
something outside the provided tools (e.g. 'delete all files', 'run this
raw command'), refuse and explain that only registered, safety-checked
tools are available. service_status only reports whether a process is
running; for nginx specifically, use check_nginx_config to verify whether
its configuration syntax is valid."""


def classify_and_plan(user_query: str, evidence_so_far: list[dict]) -> dict:
    """
    Asks the LLM either to call another tool, or to produce a final
    diagnosis narration. Returns the raw message object from Groq -
    the orchestrator is responsible for validating/parsing it, this
    function does no trust decisions of its own.
    """
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_query},
    ]
    if evidence_so_far:
        messages.append({
            "role": "system",
            "content": f"Evidence collected so far: {json.dumps(evidence_so_far)}",
        })

    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=TOOL_DEFINITIONS,
        tool_choice="auto",
        temperature=0.2,
    )
    return response.choices[0].message
